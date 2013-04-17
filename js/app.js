$(document).ready(function(){
    (function(){
        // A few convenient fixes
        var settings = {
                upload_uri: "https://api.imgur.com/3/image",
                // Get your own at https://api.imgur.com/oauth2/addclient
                client_id:  "891d1ed77f3ecf4",
                file_list: []
            },

            ImageModel = Backbone.Model.extend({
                // Declare useful properties
                defaults: {
                    // File API object for this image
                    fileObject: undefined,
                    // empty data URL == needs a thumbnail
                    dataURL: '',
                    status: 0,
                    deletehash: '',
                    id: '',
                    link: ''
                },

                sync: function(){}
            }),


            ImageCollection = Backbone.Collection.extend({
                model: ImageModel,
                sync: function(){}
            }),

            GenericView = Backbone.View.extend({
                // Add listening to a collection of events
                listenToMany: function(other, events){
                    for(var p in events) {
                        this.listenTo(other, p, events[p]);
                    }
                }
            }),

            ImageView = GenericView.extend({
                template: $('#image_template'),
                dom: {},


                /*
                 * CONTROLLER
                 */
                initialize: function() {
                    // this just has declarative written all over it
                    this.listenToMany(this.model, {
                        'change': this.render,
                        'preview_ready': this.slideUp,
                        'slideup_ready': this.upload,
                        'uploaded': this.flipCard,
                        'destroy': this.slideDown
                    });
                },

                // Deferred DOM init
                initDOM: function() {
                    var that = this;

                    this.dom.image  = this.$('.image_large');
                    this.dom.thumb = this.$('.thumb');
                    this.dom.url = this.$('.image_url');
                    this.dom.uploadAnother = this.$('.button_another');
                    this.dom.uploadAnother.on("touchstart", function(){
                        that.newUpload();
                    });
                },

                newUpload: function() {
                    // ready UI for removal of image
                    this.model.trigger('destroy', this.model);
                },


                upload: function(){
                    var image = this.model,
                        file  = image.get('fileObject');

                    // Make sure we don't upload non-images
                    if (!file || !file.type.match(/image.*/)) return;

                    // Build a formdata object
                    var fd = new FormData();
                    fd.append("image", file); // Append the file

                    var xhr = new XMLHttpRequest();
                    xhr.open("POST", settings.upload_uri);
                    xhr.setRequestHeader('Authorization', 'Client-ID ' + settings.client_id);
                    xhr.onload = function() {
                        var response = JSON.parse(xhr.responseText);
                        console.log('Image uploaded:', response);

                        image.set('deletehash', response.data.deletehash);
                        image.set('link', response.data.link);
                        image.set('id', response.data.id);
                        image.trigger('uploaded');
                    }
                    xhr.addEventListener('error', function(e){
                        alert("Problem reaching network. No data or WiFi?");
                        image.destroy();
                    });

                    // XXX: error handling
                    xhr.send(fd);
                },

                /*
                 * VIEW
                 */
                render: function() {
                    // Only render view once, then update
                    if(this.$el.children().length == 0) {
                        this.$el = this.template.clone();
                        this.$el.attr('id', '');
                        this.el = this.$el[0];

                        this.$el.addClass('image');
                        this.$el.addClass('slide_up');
                    }

                    // Set DOM references
                    if(this.dom.image == undefined) {
                        try {
                            this.initDOM();
                        } catch(e) {
                            console.log("Couldn't init DOM");
                        }
                    }

                    this.dom.url.val(this.model.get('link'));

                    return this;
                },

                // Animate deletion
                slideDown: function() {
                    var that = this;
                    this.el.addEventListener('webkitTransitionEnd',
                         function(){
                             that.remove();
                         });
                    this.$el.addClass('slide_down');
                },

                flipCard: function(e) {
                    this.$el.toggleClass('flipped');
                    // pre-select the URL after animation is done
                    this.selectURLCallback = $.proxy(this.selectURL, this);
                    this.el.addEventListener('webkitTransitionEnd', 
                                             this.selectURLCallback);
                },

                slideUp: function() {
                    var that = this;
                    this.dom.image.attr('src', this.model.get('dataURL'));
                    this.dom.thumb.attr( 'src', this.model.get('dataURL'));

                    this.el.addEventListener('webkitTransitionEnd',
                         function slideUpHandler(e){
                             var self = slideUpHandler || arguments.callee;
                             that.el.removeEventListener('webkitTransitionEnd', self);
                             that.model.trigger('slideup_ready');
                         });
                    // Wait a bit for the data blob to draw
                    setTimeout(function(){
                        that.el.classList.remove('slide_up');
                    }, 100);
                },

                selectURL: function(e){
                    this.dom.url.select();
                    this.el.removeEventListener('webkitTransitionEnd',
                                                this.selectURLCallback);
                    delete this.selectURLCallback;
                },
            }),

            MainView = GenericView.extend({
                el: $("#app"),
                dom: {},

                events: {
                    "touchstart  #droparea": "openFileDialogue",
                    "change #upload_input": "filesSelected"
                },


                initialize: function() {
                    var that = this;
                    this.images = new ImageCollection,

                    this.dom = {
                        uploadInput : $('#upload_input'),
                        droparea    : $('#droparea'),
                        gallery     : $('#gallery'),
                        progress    : $('#progress')
                    };

                    this.listenToMany(this.images, {
                        'add': this.addImage,
                        'destroy': this.showDroparea,
                        'slideup_ready': this.showProgress,
                        'uploaded': this.hideProgress,
                        // When network is down
                    });
                    this.listenTo(this.images, 'destroy', this.hideProgress);
                },


                /*
                 * VIEW
                 */
                showProgress: function() {
                    this.dom.progress.show();
                },

                hideProgress: function(){
                    this.dom.progress.hide();
                },

                showDroparea: function(image) {
                    this.dom.droparea.show();
                },

                /*
                 * CONTROLLER
                 */

                // Add files to the array of files to be uploaded
                addFiles: function(files) {
                    for(var i=0; i<files.length; i++) {
                        this.images.create({ fileObject: files[i] }); 
                    }
                },

                addImage: function(image) {
                    this.dom.droparea.hide();
                    var view = new ImageView({model: image});
                    this.dom.gallery.append(view.render().$el[0]);
                    console.log('New image view:', view);

                    this.getLocalFile(image);
                },

                // Generate local thumbnail
                getLocalFile: function(image) {
                    var fr   = new FileReader(),
                        that = this;
                    
                    fr.onerror = function(e) {
                        alert("ERROR reading file:" + e.toString());
                    };

                    fr.onloadend = function() {
                        image.set({
                            dataURL: fr.result
                        });
                        image.trigger('preview_ready', image);
                    }

                    fr.readAsDataURL(image.get('fileObject'));
                },

                // Open browser file upload dialogue
                openFileDialogue: function(e){
                    this.dom.uploadInput.trigger('click');
                },
                
                
                // CALLBACKS
                // =============

                // Callback for files selected using browser file dialogue
                filesSelected: function(e) {
                    var files = this.dom.uploadInput[0].files;

                    e.preventDefault();
                    this.addFiles(files);

                    console.log('User selected files:', files); 
                    // Makes `change` event work if user re-uploads same image
                    this.dom.uploadInput.val('');
                },

                // Callback for files flying in via drag and drop (not used on mobile)
                filesDropped: function(e) {
                    console.log("File dropped", e);
                    this.addFiles(e.dataTransfer.files);
                },


                storeFileLocally: function(file){
                    //blackberry.io.sandbox = false;
                    // chop off the 'file:///' protocol from URI
                    //data.uri = data.uri.substr(7, data.uri.length)

                    window.webkitRequestFileSystem(window.TEMPORARY,
                        1024 * 1024,
                        function success(fs) {
                            fs.root.getFile(file.name, {create:true}, 
                                function success(fileEntry) {
                                    fileEntry.createWriter(function(fileWriter) {
                                        // Note: write() can take a File or Blob object.
                                        fileWriter.write(file); 
                                    });
                                },
                                function error(e){
                                    alert("Error reading file"+e);
                                });
                        },
                        function error(e){
                            alert("Error reading file: "+e.code);
                        }
                    );
                }
            });
           

            // Mix in event handling
            _.extend(MainView, Backbone.Events);
            window.App = new MainView();
    })();
});

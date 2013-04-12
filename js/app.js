$(document).ready(function(){
    (function(){
        // Some globals
        var settings = {
                upload_uri: "https://api.imgur.com/3/image",
                client_id:  "891d1ed77f3ecf4",
                file_list: []
            },

        // Model for a single image
            ImageModel = Backbone.Model.extend({
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

        // Initialize the image collection
            Images = new ImageCollection,

        // A view for a single image 
            ImageView = Backbone.View.extend({
                template: _.template($('#image_template').html()),
                events: {
                    //"click .image_large_container": "flipCard",
                    //"click .image_details": "flipCard"
                    "click .button_another": "handleNewUpload"
                },

                initialize: function() {
                    // this just has declarative written all over it
                    this.listenTo(this.model, 'change', this.render);
                    this.listenTo(this.model, 'preview_ready', this.slideUp, this);
                    this.listenTo(this.model, 'slideup_ready', this.upload, this);
                    this.listenTo(this.model, 'uploaded', this.flipCard);
                    this.listenTo(this.model, 'destroy', this.handleRemove);
                },

                render: function() {
                    // Only render node once, then update values
                    if(this.$el.children().length == 0) {
                        this.$el.html(this.template(this.model.toJSON()));
                        this.$el.addClass('image');
                        this.$el.addClass('slide_up');
                    }

                    // re-init DOM references
                    this.imageLarge  = this.$('.image_large');
                    this.thumbnail = this.$('.thumb');
                    this.imageURL = this.$('.image_url');

                    this.imageURL.val(this.model.get('link'));
                    //this.input = this.$('.edit');
                    return this;
                },

                handleRemove: function() {
                    var that = this;
                    this.el.addEventListener('webkitTransitionEnd',
                         function(){
                             that.remove();
                         });
                    this.$el.addClass('slide_down');
                },

                handleNewUpload: function() {
                    // ready UI for removal of image
                    this.model.trigger('prepare_destroy', this.model);
                },

                // XXX: Unused at the moment. Funky uploading animation?
                initProgressMeter: function() {
                    var canvas = this.$('.progress_left')[0],
                        context = canvas.getContext("2d"),
                        image = this.$(".image_large")[0],
                        image_ratio = image.width/image.height;

                    // Ensure adequate canvas size
                    canvas.width  = image.width;
                    canvas.height = image.height;

                    context.drawImage(image, 0, 0);

                    // Render the image black and white
                    var imgd = context.getImageData(0, 0, 
                                  image.width, 
                                  image.height),

                        pix = imgd.data,
                        luminosity = 0, i=0;

                    // Set each pixel to luminosity
                    for (i = 0, n = pix.length; i < n; i += 4) {
                        luminosity = pix[i] * .3 + pix[i+1] * .6 + 
                            pix[i+2] * .10;
                        pix[i] = pix[i+1] = pix[i+2] = luminosity;
                    }

                    context.putImageData(imgd, 0, 0);
                    this.trigger('Image:progressMeterDone');
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
                    this.imageLarge.attr('src', this.model.get('dataURL'));
                    this.thumbnail.attr( 'src', this.model.get('dataURL'));

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
                    this.imageURL.select();
                    this.el.removeEventListener('webkitTransitionEnd',
                                                this.selectURLCallback);
                    delete this.selectURLCallback;
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
                    // XXX error handling
                    xhr.send(fd);
                },
            }),

            MainView = Backbone.View.extend({
                el: $("#app"),

                events: {
                    "click  #droparea": "openFileDialogue",
                    "change #upload_input": "filesSelected"
                },


                initialize: function() {
                    var that = this;

                    // TODO: does this belong here?
                    this.uploadInput = $('#upload_input');
                    this.droparea = $('#droparea');
                    this.gallery = $('#gallery');
                    this.progress = $('#progress');

                    this.listenTo(Images, 'add', this.addImage);
                    this.listenTo(Images, 'prepare_destroy', this.removeImage);
                    this.listenTo(Images, 'slideup_ready', this.showProgress);
                    this.listenTo(Images, 'uploaded', this.hideProgress);
                },

                // UI stuff
                // ===========
                showProgress: function() {
                    this.progress.show();
                },

                hideProgress: function(){
                    this.progress.hide();
                },

                // CONTROLLER
                // ==========

                // Add files to the array of files to be uploaded
                addFiles: function(files) {
                    for(var i=0; i<files.length; i++) {
                        Images.create({ fileObject: files[i] }); 
                    }
                },

                addImage: function(image) {
                    this.droparea.hide();
                    var view = new ImageView({model: image});
                    this.gallery.append(view.render().el);
                    console.log('New image view:', view);

                    this.getLocalFile(image);
                },
                removeImage: function(image) {
                    this.droparea.show();
                    image.destroy();
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
                    this.uploadInput.trigger('click');
                },
                
                
                // CALLBACKS
                // =============

                // Callback for files selected using browser file dialogue
                filesSelected: function(e) {
                    var files = this.uploadInput[0].files;

                    e.preventDefault();
                    this.addFiles(files);

                    console.log('User selected files:', files); 
                    // Makes `change` event work if user re-uploads same image
                    this.uploadInput.val('');
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

            window.MainView = MainView;
            window.Images  = Images;

            window.App = new MainView();
    })();
});

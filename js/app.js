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
                    // `File` object for this image
                    fileObject: undefined,
                    // empty data URL == needs a thumbnail
                    dataURL: '',

                    response: {
                        status: 0,
                        deletehash: '',
                        id: '',
                        link: ''
                    }
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
                    "click": "flipCard"
                },

                initialize: function() {
                    this.listenTo(this.model, 'change', this.render);
                    // Create progress meter once image is loaded from disk
                    //this.on('Image:dataReady', this.initProgressMeter, this);
                },

                render: function() {
                    if(this.$el.children().length === 0) {
                        this.$el.html(this.template(this.model.toJSON()));
                    }

                    this.$el.addClass('image');
                    this.imageLarge  = this.$('.image_large');
                    this.thumbnail = this.$('.thumb');

                    this.imageLarge.attr('src', this.model.get('dataURL'));
                    //this.input = this.$('.edit');
                    return this;
                },

                // TODO: move into a controller
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

                flipCard: function() {
                    this.$el.toggleClass('flipped');
                }
            }),

            MainView = Backbone.View.extend({
                el: $("#app"),

                events: {
                    "click  #droparea": "openFileDialogue",
                    "change #upload_input": "filesSelected"
                },


                initialize: function() {
                    var that = this;

                    this.uploadInput = $('#upload_input');
                    this.droparea = $('#droparea');
                    this.gallery = $('#gallery');

                    Images.on('add', this.loadImageLocally, this);
                },


                // Callback for when the user has selected or dragged
                // new files and they are ready to be uploaded
                filesReady: function() {
                    var files = _.clone(settings.file_list), file;

                    while( settings.file_list.length != 0 ) {
                        file = files.splice(0,1)[0]; 
                    }
                },

                // Upload all files in the settings.file_list array
                upload: function(){
                    while(settings.file_list.length != 0) {
                        var file = settings.file_list.splice(0,1)[0];

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
                            console.log('Uploaded. Got some data back:', response);

                            // XXX: Ugly GUI stuff
                            $('#droparea').remove();
                            $('.image_large').attr('src', response.data.link)
                            $('.url_imgur').val(response.data.link)
                            // emit uploaded event
                        }
                        // XXX error handling
                        xhr.send(fd);
                    }
                },
                
                // Load image data from user's disk before uploading
                loadImageLocally: function(image) {
                    console.log('New image added to collection', image);

                    var view = new ImageView({model: image}),
                        fr = new FileReader(),
                        that = this;
                    
                    fr.onloadend = function() {
                        image.set({
                            dataURL: fr.result
                        });
                        $('#droparea').remove();
                        that.gallery.append(view.render().el);
                    }

                    fr.readAsDataURL(image.get('fileObject'));
                },

                thumbnailDone: function(image) {
                    console.log('Thumbnail done');
                },

                // Open browser file upload dialogue
                openFileDialogue: function(e){
                    this.uploadInput.trigger('click');
                },
                
                // Callback for files selected using browser file dialogue
                filesSelected: function(e) {
                    var files = this.uploadInput[0].files;

                    e.preventDefault();
                    this.addFiles(files);

                    console.log('Added some new files:', files); 
                    window.files = files;
                },

                // Callback for files flying in via drag and drop
                filesDropped: function(e) {
                    console.log("File dropped", e);
                    this.addFiles(e.dataTransfer.files);
                    this.upload();
                },

                // Add files to the array of files to be uploaded
                addFiles: function(files) {
                    for(var i=0; i<files.length; i++) {
                        Images.create({ fileObject: files[i] }); 
                    }
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

            window.AppView = new MainView;
            window.Images  = Images;
    })();
});

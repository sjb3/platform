/*globals _ Spinner Handlebars Backbone jQuery Gatekeeper Quill */

var Shareabouts = Shareabouts || {};

(function(S, $, console, Quill){
  S.PlaceFormView = Backbone.View.extend({
    events: {
      'submit form': 'onSubmit',
      'change input[type="file"]': 'onInputFileChange',
      'click .category-btn.clickable + label': 'onCategoryChange',
      'click .category-menu-hamburger': 'onExpandCategories',
      'click input[data-input-type="binary_toggle"]': 'onBinaryToggle',
      'click .btn-geolocate': 'onClickGeolocate'
    },
    initialize: function(){
      var self = this;
      this.resetFormState();
      this.options.router.on("route", this.resetFormState, this);
      this.placeDetail = this.options.placeConfig.place_detail;
      this.map = self.options.appView.mapView.map;
      this.DRAWING_DEFAULTS = {
        color: "#f06eaa",
        opacity: 0.5,
        fillColor: "#f06eaa",
        fillOpacity: 0.2,
        fill: {
          color: "fillColor",
          opacity: "fillOpacity"
        },
        stroke: {
          color: "color",
          opacity: "opacity"
        }
      };

      S.TemplateHelpers.overridePlaceTypeConfig(this.options.placeConfig.items,
        this.options.defaultPlaceTypeName);
      S.TemplateHelpers.insertInputTypeFlags(this.options.placeConfig.items);

      var colorpickerControl = L.Control.extend({
        options: {
          position: "bottomright",
        },
        editMode: "fill",
        color: this.DRAWING_DEFAULTS.color,
        opacity: this.DRAWING_DEFAULTS.opacity,
        fillColor: this.DRAWING_DEFAULTS.fillColor,
        fillOpacity: this.DRAWING_DEFAULTS.fillOpacity,
        onAdd: function(map) {
          var controlDiv = L.DomUtil.create('div', 'leaflet-control-colorpicker');
          L.DomEvent
            .addListener(controlDiv, 'click', L.DomEvent.stopPropagation)
            .addListener(controlDiv, 'click', L.DomEvent.preventDefault)
            .addListener(controlDiv, 'click', function() {
              $(".sp-picker-container").css("display", ($(".sp-picker-container").is(":visible") ? "none" : "block"));
            });
          var controlUI = L.DomUtil.create('div', 'leaflet-control-colorpicker-interior', controlDiv);
          controlUI.title = 'Map ColorPicker';
          return controlDiv;
        }
      });
      this.colorpicker = new colorpickerControl;
      this.map.addControl(this.colorpicker);

      $(".leaflet-control-colorpicker").spectrum({
        flat: true,
        showButtons: false,
        showInput: true,
        showAlpha: true,
        // convert to rgba() format
        color: tinycolor(self.colorpicker.fillColor).setAlpha(self.colorpicker.fillOpacity).toRgbString(),
        move: function(color) {
          if (self.editingLayerGroup.getLayers().length > 0) {
            if (self.colorpicker.editMode === "fill") {
              self.editingLayerGroup.getLayers()[0].setStyle({
                fillColor: color.toHexString(),
                fillOpacity: color.getAlpha()
              });
              self.colorpicker.fillColor = color.toHexString();
              self.colorpicker.fillOpacity = color.getAlpha();
            } else if (self.colorpicker.editMode === "stroke") {
              self.editingLayerGroup.getLayers()[0].setStyle({
                color: color.toHexString(),
                opacity: color.getAlpha()
              });
              self.colorpicker.color = color.toHexString();
              self.colorpicker.opacity = color.getAlpha();
            }
          }
        },
        change: function() {
          console.log("color change");
        }
      });

      $(".sp-picker-container")
        .css("display", "none")
        .prepend("<button type='button' class='sp-choose sp-selected' x-edit-mode='fill'>Fill</button>" +
          "<button type='button' class='sp-choose' x-edit-mode='stroke'>Stroke</button>");

      $(".sp-choose").on("click", function() {
        $(this).addClass("sp-selected");
        $(this).siblings().removeClass("sp-selected");
        self.colorpicker.editMode = $(this).attr("x-edit-mode");
        $(".leaflet-control-colorpicker").spectrum("set",
          tinycolor(self.colorpicker[self.DRAWING_DEFAULTS[$(this).attr("x-edit-mode")].color])
            .setAlpha(self.colorpicker[self.DRAWING_DEFAULTS[$(this).attr("x-edit-mode")].opacity]).toRgbString());
      });
     
      this.map.on("draw:deleted", function(e) {
        if (self.editingLayerGroup.getLayers().length == 0) {
          $(".leaflet-control-colorpicker").css("display", "none");
          self.drawControlEditOnly.removeFrom(self.map);
          self.drawControl.addTo(self.map);
        }
      });

      this.map.on("draw:created", function(e) {
        var buildCoords = function(layer) {
          var coordinates = [],
          latLngs = layer.getLatLngs();
          for (var i = 0; i < latLngs.length; i++) {
            coordinates.push([latLngs[i].lng, latLngs[i].lat]);
          }

          return coordinates;
        };

        if (e.layerType === "polygon" || e.layerType === "rectangle") {
          var coordinates = buildCoords(e.layer),
          latLngs = e.layer.getLatLngs();
          // make sure the final polygon vertex exactly matches the first
          coordinates.push([latLngs[0].lng, latLngs[0].lat]);
          self.formState.geometry = {
            "type": "Polygon",
            "coordinates": [coordinates]
          }
        } else if (e.layerType === "polyline") {
          var coordinates = buildCoords(e.layer);
          self.formState.geometry = {
            "type": "LineString",
            "coordinates": coordinates
          }
        }

        self.editingLayerGroup.addLayer(e.layer);
        self.drawControl.removeFrom(self.map);
        self.drawControlEditOnly.addTo(self.map);
        $(".leaflet-control-colorpicker").css("display", "block");
      });
    },
    resetFormState: function() {
      this.formState = {
        selectedCategoryConfig: {
          fields: []
        },
        isSingleCategory: false,
        attachmentData: null,
        commonFormElements: this.options.placeConfig.common_form_elements || {}
        geometry: {}
      }
    },
    resetDrawControl: function() {
      if (this.editingLayerGroup) {
        this.map.removeLayer(this.editingLayerGroup);
      }        
      if (this.drawControl && this.drawControl._map) {
        this.map.removeControl(this.drawControl);
      } else if (this.drawControlEditOnly && this.drawControlEditOnly._map) {
        this.map.removeControl(this.drawControlEditOnly);
        $(".leaflet-control-colorpicker").css("display", "none");
        $(".sp-picker-container").css("display", "none");
      }
    },
    render: function(category, isCategorySelected) {
      var self = this,
      placesToIncludeOnForm = _.filter(this.placeDetail, function(place) { 
        return place.includeOnForm; 
      });

      // if there is only one place to include on form, skip category selection page
      if (placesToIncludeOnForm.length === 1) {
        this.formState.isSingleCategory = true;
        isCategorySelected = true;
        this.formState.selectedCategoryConfig = placesToIncludeOnForm[0];
      }
      
      this.checkAutocomplete();
      
      var data = _.extend({
        isCategorySelected: isCategorySelected,
        placeConfig: this.options.placeConfig,
        selectedCategoryConfig: this.formState.selectedCategoryConfig,
        user_token: this.options.userToken,
        current_user: S.currentUser,
        isSingleCategory: this.formState.isSingleCategory
      }, S.stickyFieldValues);

      this.$el.html(Handlebars.templates['place-form'](data));

      if (selectedCategoryConfig.enable_geometry) {
        this.options.appView.hideCenterPoint();
        this.options.appView.removeSpotlightMask();
        this.editingLayerGroup = new L.FeatureGroup();
        this.map.addLayer(this.editingLayerGroup);
        this.drawControlEditOnly = new L.Control.Draw({
          position: "bottomright",
          edit: {
            featureGroup: self.editingLayerGroup,
            edit: {
              selectedPathOptions: {
                maintainColor: true,
              }
            }
          },
          draw: false
        });
        this.drawControl = new L.Control.Draw({
          position: "bottomright",
          edit: false,
          draw: {
            circle: false,
            marker: false,
            polygon: {
              shapeOptions: {
                color: this.DRAWING_DEFAULTS.color,
                opacity: this.DRAWING_DEFAULTS.opacity,
                fillColor: this.DRAWING_DEFAULTS.fillColor,
                fillOpacity: this.DRAWING_DEFAULTS.fillOpacity
              }
            },
            rectangle: {
              shapeOptions: {
                color: this.DRAWING_DEFAULTS.color,
                opacity: this.DRAWING_DEFAULTS.opacity,
                fillColor: this.DRAWING_DEFAULTS.fillColor,
                fillOpacity: this.DRAWING_DEFAULTS.fillOpacity
              }
            },
            polyline: {
              shapeOptions: {
                color: this.DRAWING_DEFAULTS.color,
                opacity: this.DRAWING_DEFAULTS.opacity
              }
            }
          }
        });
        this.map.addControl(this.drawControl);
      } else {
        this.resetDrawControl();
        this.options.appView.showNewPin();
      }

      if (this.center) $(".drag-marker-instructions").addClass("is-visuallyhidden");

      return this;
    },
    // called from the app view
    postRender: function() {
      var self = this,
      $prompt;

      $('#datetimepicker').datetimepicker({ formatTime: 'g:i a' });
      if ($(".rawHTML").length > 0) {
        // NOTE: we currently support a single QuillJS field per form
        $prompt = $(".rawHTML").find("label").detach();

        // Quill toolbar configuration
        var toolbarOptions = [
          ["bold", "italic", "underline", "strike"],
          [{ "list": "ordered" }, { "list": "bullet" }],
          [{ "header": [1, 2, 3, 4, 5, 6, false] }],
          [{ "color": [] }, { "background": [] }],
          ["link", "image", "video"]
        ],
        quill = new Quill(".rawHTML", {
          modules: { 
            "toolbar": toolbarOptions
          },
          theme: "snow",
          bounds: "#content",
          placeholder: _.find(
            this.formState.selectedCategoryConfig.fields, function(categoryField) {
              return categoryField.type === "rawHTML"
            }).placeholder
        }),
        toolbar = quill.getModule("toolbar");
        $(".ql-toolbar").before($prompt);
        quill.deleteText(0, 50);

        // override default image upload behavior: instead, create an <img>
        // tag with highlighted text set as the src attribute
        toolbar.addHandler("image", function() {
          var range = quill.getSelection();
          quill.insertEmbed(range.index, "image", quill.getText(range.index, range.length), "user");
        }); 
      }
    },
    checkAutocomplete: function() {
      var self = this,
      storedValue;

      this.formState.selectedCategoryConfig.fields.forEach(function(field, i) {
        storedValue = S.Util.getAutocompleteValue(field.name);
        self.formState.selectedCategoryConfig.fields[i].autocompleteValue = storedValue || null;
      });
      this.formState.commonFormElements.forEach(function(field, i) {
        storedValue = S.Util.getAutocompleteValue(field.name);
        self.formState.commonFormElements[i].autocompleteValue = storedValue || null;
      });
    },
    remove: function() {
      this.unbind();
    },
    onError: function(model, res) {
      // TODO handle model errors!
      console.log('oh no errors!!', model, res);
    },
    // This is called from the app view
    setLatLng: function(latLng) {
      this.center = latLng;
      this.$('.drag-marker-instructions, .drag-marker-warning').addClass('is-visuallyhidden');
    },
    setLocation: function(location) {
      this.location = location;
    },
    getAttrs: function() {
      var self = this,
          attrs = {},
          locationAttr = this.options.placeConfig.location_item_name,
          $form = this.$('form');
      attrs = S.Util.getAttrs($form);

      // get values off of binary toggle buttons that have not been toggled
      $.each($("input[data-input-type='binary_toggle']:not(:checked)"), function() {
        attrs[$(this).attr("name")] = $(this).val();
      });

      _.each(attrs, function(value, key) {
        var itemConfig = _.find(
          self.formState.selectedCategoryConfig.fields
            .concat(self.formState.commonFormElements), function(field) { 
              return field.name === key 
            }) || {};
        if (itemConfig.autocomplete) {
          S.Util.saveAutocompleteValue(key, value, 30);
        }
      });

      // Get the location attributes from the map
      // attrs.geometry = {
      //   type: 'Point',
      //   coordinates: [this.center.lng, this.center.lat]
      // };
      // attrs.geometry = {
      //   'type': 'Polygon',
      //   'coordinates': [[[-67.13734351262877, 45.137451890638886],
      //     [-66.96466, 44.8097],
      //     [-68.03252, 44.3252],
      //     [-69.06, 43.98],
      //     [-70.11617, 43.68405],
      //     [-70.64573401557249, 43.090083319667144],
      //     [-70.75102474636725, 43.08003225358635],
      //     [-70.79761105007827, 43.21973948828747],
      //     [-70.98176001655037, 43.36789581966826],
      //     [-70.94416541205806, 43.46633942318431],
      //     [-71.08482, 45.3052400000002],
      //     [-70.6600225491012, 45.46022288673396],
      //     [-70.30495378282376, 45.914794623389355],
      //     [-70.00014034695016, 46.69317088478567],
      //     [-69.23708614772835, 47.44777598732787],
      //     [-68.90478084987546, 47.184794623394396],
      //     [-68.23430497910454, 47.35462921812177],
      //     [-67.79035274928509, 47.066248887716995],
      //     [-67.79141211614706, 45.702585354182816],
      //     [-67.13734351262877, 45.137451890638886]]]
      // } 
      // 
      // If the map has no editingLayerGroup, assume we're adding
      // point geometry
      if (!this.map.hasLayer(this.editingLayerGroup)) {
        this.formState.geometry = {
          type: 'Point',
          coordinates: [this.center.lng, this.center.lat]
        }
      }
      
      attrs.geometry = this.formState.geometry;

      if (this.location && locationAttr) {
        attrs[locationAttr] = this.location;
      }

      return attrs;
    },
    onCategoryChange: function(evt) {
      var self = this,
          animationDelay = 400;

      this.formState.selectedCategoryConfig = _.find(this.placeDetail, function(place) {
        return place.category == $(evt.target).parent().prev().attr('id');
      });

      this.render(true);
      this.postRender();
      $(evt.target).parent().prev().prop("checked", true);
      $("#selected-category").hide().show(animationDelay);
      $("#category-btns").animate( { height: "hide" }, animationDelay );
      if (this.center) this.$('.drag-marker-instructions, .drag-marker-warning').addClass('is-visuallyhidden');
    },
    onClickGeolocate: function(evt) {
      var self = this;
      evt.preventDefault();
      var ll = this.options.appView.mapView.map.getBounds().toBBoxString();
      S.Util.log('USER', 'map', 'geolocate', ll, this.options.appView.mapView.map.getZoom());
      $("#drag-marker-content").addClass("is-visuallyhidden");
      $("#geolocating-msg").removeClass("is-visuallyhidden");

      this.options.appView.mapView.map.locate()
        .on("locationfound", function() { 
          self.center = self.options.appView.mapView.map.getCenter();
          $("#spotlight-place-mask").remove();
          $("#drag-marker-content").addClass("is-visuallyhidden");
        })
        .on("locationerror", function() {
          $("#drag-marker-content").removeClass("is-visuallyhidden");
          $("#geolocating-msg").addClass("is-visuallyhidden");
        });
    },
    onInputFileChange: function(evt) {
      var self = this,
          file,
          attachment;

      if(evt.target.files && evt.target.files.length) {
        file = evt.target.files[0];

        this.$('.fileinput-name').text(file.name);
        S.Util.fileToCanvas(file, function(canvas) {
          canvas.toBlob(function(blob) {
            self.formState.attachmentData = {
              name: $(evt.target).attr('name'),
              blob: blob,
              file: canvas.toDataURL('image/jpeg')
            }
          }, 'image/jpeg');
        }, {
          // TODO: make configurable
          maxWidth: 800,
          maxHeight: 800,
          canvas: true
        });
      }
    },
    onBinaryToggle: function(evt) {
      var self = this,
      targetButton = $(evt.target).attr("id"),
      oldValue = $(evt.target).val(),
      altData = _.find(this.formState.selectedCategoryConfig.fields
        .concat(self.formState.commonFormElements), function(item) { 
          return item.name === targetButton; 
        }),
      altContent = _.find(altData.content, function(item) { return item.value != oldValue; });

      // set new value and label
      $(evt.target).val(altContent.value);
      $(evt.target).next("label").html(altContent.label);
    },
    closePanel: function() {
      this.center = null;
      this.resetFormState();
      this.resetDrawControl();
    },
    onExpandCategories: function(evt) {
      var animationDelay = 400;
      $("#selected-category").hide(animationDelay);
      $("#category-btns").animate( { height: "show" }, animationDelay ); 
    },
    onSubmit: Gatekeeper.onValidSubmit(function(evt) {
      var self = this,
      rejectSubmit = function(warningClass) {
        self.$(".drag-marker-instructions").addClass("is-visuallyhidden");
        self.$(warningClass).removeClass("is-visuallyhidden");
        self.$el.parent("article").scrollTop(0);
        window.scrollTo(0, 0);
      };

      if (this.map.hasLayer(this.editingLayerGroup) 
        && this.editingLayerGroup.getLayers().length == 0) {
        // If the map has an editingLayerGroup with no layers in it, it means the
        // user hasn't created any geometry yet
        rejectSubmit(".no-geometry-warning");
        return;
      } else if (!this.center) {
        rejectSubmit(".drag-marker-warning");
        return;
      }

      var self = this,
        router = this.options.router,
        collection = this.collection[self.formState.selectedCategoryConfig.dataset],
        model,
        // Should not include any files
        attrs = this.getAttrs(),
        $button = this.$('[name="save-place-btn"]'),
        spinner, $fileInputs,
        richTextAttrs = {};

      // if we have a Quill-enabled field, assume content from this field belongs
      // to the model's description attribute. We'll need to make this behavior 
      // more sophisticated to support multiple Quill-enabled fields.
      if ($(".ql-editor").html()) {
        richTextAttrs.description = $(".ql-editor").html();
      }
      attrs = _.extend(attrs, richTextAttrs);

      if (this.map.hasLayer(this.editingLayerGroup)) {
        attrs["style"] = {
          color: this.colorpicker.color,
          opacity: this.colorpicker.opacity,
          fillColor: this.colorpicker.fillColor,
          fillOpacity: this.colorpicker.fillOpacity
        }
      }

      evt.preventDefault();

      collection.add({"location_type": this.formState.selectedCategoryConfig.category});
      model = collection.at(collection.length - 1);

      model.set("datasetSlug", _.find(this.options.mapConfig.layers, function(layer) { 
        return self.formState.selectedCategoryConfig.dataset == layer.id;
      }).slug);
      model.set("datasetId", self.formState.selectedCategoryConfig.dataset);

      // if an attachment has been added...
      if (self.formState.attachmentData) {
        var attachment = model.attachmentCollection.find(function(attachmentModel) {
          return attachmentModel.get('name') === self.formState.attachmentData.name;
        });

        if (_.isUndefined(attachment)) {
          model.attachmentCollection.add(self.formState.attachmentData);
        } else {
          attachment.set(self.formState.attachmentData);
        }
      }

      $button.attr('disabled', 'disabled');
      spinner = new Spinner(S.smallSpinnerOptions).spin(self.$('.form-spinner')[0]);

      S.Util.log('USER', 'new-place', 'submit-place-btn-click');

      S.Util.setStickyFields(attrs, S.Config.survey.items, S.Config.place.items);

      // Save and redirect
      model.save(attrs, {
        success: function() {
          if (self.editingLayerGroup) {
            // remove the temporary editing layer group if it exists
            self.map.removeLayer(self.editingLayerGroup);
          }
          S.Util.log('USER', 'new-place', 'successfully-add-place');
          router.navigate('/'+ model.get('datasetSlug') + '/' + model.id, {trigger: true});
        },
        error: function() {
          S.Util.log('USER', 'new-place', 'fail-to-add-place');
        },
        complete: function() {
          $button.removeAttr('disabled');
          spinner.stop();
          self.resetFormState();
          self.resetDrawControl();
        },
        wait: true
      });
    })
  });
}(Shareabouts, jQuery, Shareabouts.Util.console, Quill));

/**
 * Metabase API
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: v1.53.2-SNAPSHOT
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD.
    define(['expect.js', process.cwd()+'/src/index'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    factory(require('expect.js'), require(process.cwd()+'/src/index'));
  } else {
    // Browser globals (root is window)
    factory(root.expect, root.MetabaseApi);
  }
}(this, function(expect, MetabaseApi) {
  'use strict';

  var instance;

  beforeEach(function() {
    instance = new MetabaseApi.ApiCardPostRequestParametersInner();
  });

  var getProperty = function(object, getter, property) {
    // Use getter method if present; otherwise, get the property directly.
    if (typeof object[getter] === 'function')
      return object[getter]();
    else
      return object[property];
  }

  var setProperty = function(object, setter, property, value) {
    // Use setter method if present; otherwise, set the property directly.
    if (typeof object[setter] === 'function')
      object[setter](value);
    else
      object[property] = value;
  }

  describe('ApiCardPostRequestParametersInner', function() {
    it('should create an instance of ApiCardPostRequestParametersInner', function() {
      // uncomment below and update the code to test ApiCardPostRequestParametersInner
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be.a(MetabaseApi.ApiCardPostRequestParametersInner);
    });

    it('should have the property sectionId (base name: "sectionId")', function() {
      // uncomment below and update the code to test the property sectionId
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property valuesSourceConfig (base name: "values_source_config")', function() {
      // uncomment below and update the code to test the property valuesSourceConfig
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property id (base name: "id")', function() {
      // uncomment below and update the code to test the property id
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property name (base name: "name")', function() {
      // uncomment below and update the code to test the property name
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property slug (base name: "slug")', function() {
      // uncomment below and update the code to test the property slug
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property type (base name: "type")', function() {
      // uncomment below and update the code to test the property type
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property temporalUnits (base name: "temporal_units")', function() {
      // uncomment below and update the code to test the property temporalUnits
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property valuesSourceType (base name: "values_source_type")', function() {
      // uncomment below and update the code to test the property valuesSourceType
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

    it('should have the property _default (base name: "default")', function() {
      // uncomment below and update the code to test the property _default
      //var instance = new MetabaseApi.ApiCardPostRequestParametersInner();
      //expect(instance).to.be();
    });

  });

}));

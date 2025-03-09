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
    instance = new MetabaseApi.MetabaseAnalyzeFingerprintSchema1Fingerprint();
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

  describe('MetabaseAnalyzeFingerprintSchema1Fingerprint', function() {
    it('should create an instance of MetabaseAnalyzeFingerprintSchema1Fingerprint', function() {
      // uncomment below and update the code to test MetabaseAnalyzeFingerprintSchema1Fingerprint
      //var instance = new MetabaseApi.MetabaseAnalyzeFingerprintSchema1Fingerprint();
      //expect(instance).to.be.a(MetabaseApi.MetabaseAnalyzeFingerprintSchema1Fingerprint);
    });

    it('should have the property experimental (base name: "experimental")', function() {
      // uncomment below and update the code to test the property experimental
      //var instance = new MetabaseApi.MetabaseAnalyzeFingerprintSchema1Fingerprint();
      //expect(instance).to.be();
    });

    it('should have the property global (base name: "global")', function() {
      // uncomment below and update the code to test the property global
      //var instance = new MetabaseApi.MetabaseAnalyzeFingerprintSchema1Fingerprint();
      //expect(instance).to.be();
    });

    it('should have the property type (base name: "type")', function() {
      // uncomment below and update the code to test the property type
      //var instance = new MetabaseApi.MetabaseAnalyzeFingerprintSchema1Fingerprint();
      //expect(instance).to.be();
    });

  });

}));

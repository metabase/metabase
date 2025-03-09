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
    instance = new MetabaseApi.ApiSessionApi();
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

  describe('ApiSessionApi', function() {
    describe('apiSessionDelete', function() {
      it('should call apiSessionDelete successfully', function(done) {
        //uncomment below and update the code to test apiSessionDelete
        //instance.apiSessionDelete(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiSessionForgotPasswordPost', function() {
      it('should call apiSessionForgotPasswordPost successfully', function(done) {
        //uncomment below and update the code to test apiSessionForgotPasswordPost
        //instance.apiSessionForgotPasswordPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiSessionGoogleAuthPost', function() {
      it('should call apiSessionGoogleAuthPost successfully', function(done) {
        //uncomment below and update the code to test apiSessionGoogleAuthPost
        //instance.apiSessionGoogleAuthPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiSessionPasswordResetTokenValidGet', function() {
      it('should call apiSessionPasswordResetTokenValidGet successfully', function(done) {
        //uncomment below and update the code to test apiSessionPasswordResetTokenValidGet
        //instance.apiSessionPasswordResetTokenValidGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiSessionPost', function() {
      it('should call apiSessionPost successfully', function(done) {
        //uncomment below and update the code to test apiSessionPost
        //instance.apiSessionPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiSessionPropertiesGet', function() {
      it('should call apiSessionPropertiesGet successfully', function(done) {
        //uncomment below and update the code to test apiSessionPropertiesGet
        //instance.apiSessionPropertiesGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiSessionResetPasswordPost', function() {
      it('should call apiSessionResetPasswordPost successfully', function(done) {
        //uncomment below and update the code to test apiSessionResetPasswordPost
        //instance.apiSessionResetPasswordPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
  });

}));

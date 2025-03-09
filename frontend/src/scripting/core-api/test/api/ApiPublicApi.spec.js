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
    instance = new MetabaseApi.ApiPublicApi();
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

  describe('ApiPublicApi', function() {
    describe('apiPublicActionUuidExecutePost', function() {
      it('should call apiPublicActionUuidExecutePost successfully', function(done) {
        //uncomment below and update the code to test apiPublicActionUuidExecutePost
        //instance.apiPublicActionUuidExecutePost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicActionUuidGet', function() {
      it('should call apiPublicActionUuidGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicActionUuidGet
        //instance.apiPublicActionUuidGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet', function() {
      it('should call apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet
        //instance.apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet', function() {
      it('should call apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet
        //instance.apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidFieldFieldIdValuesGet', function() {
      it('should call apiPublicCardUuidFieldFieldIdValuesGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidFieldFieldIdValuesGet
        //instance.apiPublicCardUuidFieldFieldIdValuesGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidGet', function() {
      it('should call apiPublicCardUuidGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidGet
        //instance.apiPublicCardUuidGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidParamsParamKeySearchQueryGet', function() {
      it('should call apiPublicCardUuidParamsParamKeySearchQueryGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidParamsParamKeySearchQueryGet
        //instance.apiPublicCardUuidParamsParamKeySearchQueryGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidParamsParamKeyValuesGet', function() {
      it('should call apiPublicCardUuidParamsParamKeyValuesGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidParamsParamKeyValuesGet
        //instance.apiPublicCardUuidParamsParamKeyValuesGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidQueryExportFormatGet', function() {
      it('should call apiPublicCardUuidQueryExportFormatGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidQueryExportFormatGet
        //instance.apiPublicCardUuidQueryExportFormatGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicCardUuidQueryGet', function() {
      it('should call apiPublicCardUuidQueryGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicCardUuidQueryGet
        //instance.apiPublicCardUuidQueryGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost', function() {
      it('should call apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost
        //instance.apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet', function() {
      it('should call apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet
        //instance.apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidDashcardDashcardIdExecuteGet', function() {
      it('should call apiPublicDashboardUuidDashcardDashcardIdExecuteGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidDashcardDashcardIdExecuteGet
        //instance.apiPublicDashboardUuidDashcardDashcardIdExecuteGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidDashcardDashcardIdExecutePost', function() {
      it('should call apiPublicDashboardUuidDashcardDashcardIdExecutePost successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidDashcardDashcardIdExecutePost
        //instance.apiPublicDashboardUuidDashcardDashcardIdExecutePost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet', function() {
      it('should call apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet
        //instance.apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet', function() {
      it('should call apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet
        //instance.apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidFieldFieldIdValuesGet', function() {
      it('should call apiPublicDashboardUuidFieldFieldIdValuesGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidFieldFieldIdValuesGet
        //instance.apiPublicDashboardUuidFieldFieldIdValuesGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidGet', function() {
      it('should call apiPublicDashboardUuidGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidGet
        //instance.apiPublicDashboardUuidGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidParamsParamKeySearchQueryGet', function() {
      it('should call apiPublicDashboardUuidParamsParamKeySearchQueryGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidParamsParamKeySearchQueryGet
        //instance.apiPublicDashboardUuidParamsParamKeySearchQueryGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicDashboardUuidParamsParamKeyValuesGet', function() {
      it('should call apiPublicDashboardUuidParamsParamKeyValuesGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicDashboardUuidParamsParamKeyValuesGet
        //instance.apiPublicDashboardUuidParamsParamKeyValuesGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicOembedGet', function() {
      it('should call apiPublicOembedGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicOembedGet
        //instance.apiPublicOembedGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicPivotCardUuidQueryGet', function() {
      it('should call apiPublicPivotCardUuidQueryGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicPivotCardUuidQueryGet
        //instance.apiPublicPivotCardUuidQueryGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet', function() {
      it('should call apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet
        //instance.apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
  });

}));

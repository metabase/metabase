'use strict';
/*global _*/

import MetadataEditor from './components/MetadataEditor.react';

angular
.module('metabase.admin.metadata.controllers', [
    'corvus.services',
    'corvus.directives',
    'metabase.forms'
])
.controller('MetadataEditor', ['$scope', 'databases', 'Metabase', function($scope, databases, Metabase) {
    // inject the React component to be rendered
    $scope.MetadataEditor = MetadataEditor;

    $scope.database = databases[0];
    $scope.databases = databases;
    $scope.metabaseApi = Metabase;

    $scope.selectDatabaseFn = function(db) {
        $scope.database = db;
    };

}]);

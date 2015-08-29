'use strict';

import Table from "metabase/lib/table";

var HomeControllers = angular.module('metabase.home.controllers', [
    'metabase.home.directives',
    'metabase.metabase.services'
]);

HomeControllers.controller('Home', ['$scope', '$location',  function($scope, $location) {
    $scope.currentView = 'data';
    $scope.showOnboarding = false;

    if('new' in $location.search()) {
        $scope.showOnboarding = true;
    }
}]);

HomeControllers.controller('HomeGreeting', ['$scope', '$location',  function($scope, $location) {
    var greetingPrefixes = [
        'Hey there',
        'How\'s it going',
        'Howdy',
        'Greetings',
        'Good to see you',
    ];

    var subheadPrefixes = [
        'What do you want to know?',
        'What\'s on your mind?',
        'What do you want to find out?',
    ];

    function buildGreeting (greetingOptions, personalization) {
        // TODO - this can result in an undefined thing
        var randomGreetingIndex = Math.floor(Math.random() * (greetingOptions.length - 1));
        var greeting = greetingOptions[randomGreetingIndex];

        if(personalization) {
            greeting = greeting + ' ' + personalization;
        }
        return greeting;
    }

    $scope.greeting = buildGreeting(greetingPrefixes, $scope.user.first_name);
    $scope.subheading = subheadPrefixes[Math.floor(Math.random() * (subheadPrefixes.length - 1))];
}]);

HomeControllers.controller('HomeDatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {

    $scope.databases = [];
    $scope.currentDB = {};
    $scope.tables = [];

    Metabase.db_list(function (databases) {
        $scope.databases = databases;
        $scope.selectCurrentDB(0)
    }, function (error) {
        console.log(error);
    });


    $scope.selectCurrentDB = function(index) {
        $scope.currentDB = $scope.databases[index];
        Metabase.db_tables({
            'dbId': $scope.currentDB.id
        }, function (tables) {
            $scope.tables = tables.filter(Table.isQueryable);
        }, function (error) {
            console.log(error);
        })
    }
}]);

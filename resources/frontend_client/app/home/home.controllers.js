'use strict';

var HomeControllers = angular.module('corvus.home.controllers', ['corvus.home.directives']);

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
        var randomGreetingIndex = Math.floor(Math.random() * (greetingOptions.length - 1) + 0);
        var greeting = greetingOptions[randomGreetingIndex];

        if(personalization) {
            greeting = greeting + ' ' + personalization;
        }
        return greeting;
    }

    $scope.greeting = buildGreeting(greetingPrefixes, $scope.user.first_name);
    $scope.subheading = "What do you want to know?";
}]);

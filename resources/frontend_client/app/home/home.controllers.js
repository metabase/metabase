var HomeControllers = angular.module('corvus.home.controllers', []);

HomeControllers.controller('Home', ['$scope', '$location',  function($scope, $location) {
    $scope.currentView = 'data';
}]);

HomeControllers.controller('HomeGreeting', ['$scope', '$location',  function($scope, $location) {
    var greetingPrefixes = [
        'Hey there',
        'How\'s it going',
        'Good morning',
        'Howdy',
        'Looking good',
        'Greetings',
        'Good to see you',
    ];

    var subheadPrefixes = [
        'What do you want to know?',
        'What\'s on your mind?',
        'What do you want to find out?',
        'Hodor Hodor Hodor'
    ];

    function buildGreeting (greetingOptions, personalization) {
        // TODO - this can result in an undefined thing
        var randomGreetingIndex = Math.floor(Math.random() * (greetingOptions.length - 1) + 0);
        console.log(greetingOptions, randomGreetingIndex);
        var greeting = greetingOptions[randomGreetingIndex];

        if(personalization) {
            greeting = greeting + ' ' + personalization;
        }
        return greeting;
    }

    $scope.greeting = buildGreeting(greetingPrefixes, $scope.user.first_name);
    $scope.subheading = buildGreeting(subheadPrefixes);
}]);

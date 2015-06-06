var HomeControllers = angular.module('corvus.home.controllers', []);

HomeControllers.controller('Home', ['$scope', '$location',  function($scope, $location) {
    console.log("FUCK YEAH WE'RE HOME")
}]);

HomeControllers.controller('HomeGreeting', ['$scope', '$location',  function($scope, $location) {
    var greetingPrefixes = [
        'Hey there',
        'How\'s it going',
    ];
    function buildGreeting () {
    }
    $scope.greeting = 'Hey there Kyle';
    console.log($scope);
}]);

var HomeControllers = angular.module('corvus.home.controllers', []);

HomeControllers.controller('Home', ['$scope', '$location',  function($scope, $location) {
    console.log("FUCK YEAH WE'RE HOME")
}]);

HomeControllers.controller('HomeGreeting', ['$scope', '$location',  function($scope, $location) {
    console.log("FUCK YEAH WE'RE GREETING")
}]);

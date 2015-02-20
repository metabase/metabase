/*global _*/
'use strict';

var EmailReportServices = angular.module('corvusadmin.emailreport.services', ['ngResource', 'ngCookies']);

EmailReportServices.service('EmailReportUtils', function () {
    this.weekdayFullName = function (abbr) {
        var days_of_week = {
            "sun": "Sunday",
            "mon": "Monday",
            "tue": "Tuesday",
            "wed": "Wednesday",
            "thu": "Thursday",
            "fri": "Friday",
            "sat": "Saturday"
        };

        if (abbr in days_of_week) {
            return days_of_week[abbr];
        } else {
            return abbr;
        }
    };

    this.humanReadableSchedule = function (schedule) {
        // takes in a dictionary representation of a 'schedule' from an EmailReport
        // and provides a human readable representation of what's going to take place

        // start with a crappy message for the user
        var msg = "Your report will be sent ";

        // first part of the message is what days of the week we are running on
        if (schedule.days_of_week) {
            var msg_day = "";
            var cnt = 0;
            var selected = [];
            Object.keys(schedule.days_of_week).forEach(function (key) {
                if (schedule.days_of_week[key]) {
                    cnt++;
                    selected.push(key);
                }
            });

            if (cnt === 0) {
                return "You're report will not run because you haven't selected any days to run it on.";
            } else if (cnt === 1) {
                msg_day = "on "+this.weekdayFullName(selected[0])+"s";
            } else if (cnt === 2) {
                msg_day = "on "+this.weekdayFullName(selected[0])+"s and "+this.weekdayFullName(selected[1])+"s";
            } else if (cnt === 7) {
                msg_day = "every day";
            } else {
                // last case is 3-6 days selected
                msg_day = cnt+" days a week";
            }

            msg = msg + msg_day;
        }

        // add on some indication of what time of the day it will run
        if (schedule.time_of_day) {
            var msg_time = "";

            if (_.contains(['morning', 'evening', 'afternoon'], schedule.time_of_day)) {
                msg_time = " in the "+schedule.time_of_day;
            } else {
                msg_time = " at "+schedule.time_of_day;
            }

            msg = msg + msg_time;
        }

        // lastly, add on our timezone
        if (schedule.timezone) {
            msg = msg + " ("+schedule.timezone+")";
        }

        return msg;
    };
});

EmailReportServices.factory('EmailReport', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/emailreport/:reportId', {}, {
        form_input: {
            url:'/api/emailreport/form_input?org=:orgId',
            method:'GET',
        },
        list: {
            url:'/api/emailreport/?org=:orgId&f=:filterMode',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/emailreport/',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        get: {
            method:'GET',
            params:{reportId:'@reportId'}
        },
        update: {
            method:'PUT',
            params:{reportId:'@id'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        delete: {
            method:'DELETE',
            params:{reportId:'@reportId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        execute: {
            method:'POST',
            params:{reportId:'@reportId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        recent_execs: {
            url:'/url/emailreport/@reportId/executions',
            method:'GET',
            params:{reportId:'@reportId'}
        }
    });
}]);

EmailReportServices.factory('EmailReportExec', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/etl/jobexec/:execId', {}, {
        list: {
            url:'/api/etl/jobexec',
            method:'GET',
            isArray:true
        },
        get: {
            method:'GET',
            params:{execId:'@execId'}
        }
    });
}]);

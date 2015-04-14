'use strict';

var EmailReportControllers = angular.module('corvusadmin.emailreport.controllers', [
    'corvus.metabase.services',
    'metabase.forms'
]);

EmailReportControllers.controller('EmailReportList', ['$scope', '$routeParams', '$location', 'EmailReport',
    function($scope, $routeParams, $location, EmailReport) {

        // $scope.reports
        $scope.filterMode = 'all';
        $scope.sortMode = 'name';

        $scope.filter = function(mode) {
            $scope.filterMode = mode;

            $scope.$watch('currentOrg', function(org) {
                if (!org) return;

                EmailReport.list({
                    'orgId': org.id,
                    'filterMode': mode
                }, function(result) {
                    $scope.reports = result;

                    $scope.sort();
                });
            });
        };

        $scope.sort = function() {
            if ('date' == $scope.sortMode) {
                $scope.reports.sort(function(a, b) {
                    a = new Date(a.updated_at);
                    b = new Date(b.updated_at);
                    return a > b ? -1 : a < b ? 1 : 0;
                });
            } else if ('org' == $scope.sortMode) {
                $scope.reports.sort(function(a, b) {
                    return a.organization.name.localeCompare(b.organization.name);
                });
            } else if ('owner' == $scope.sortMode) {
                $scope.reports.sort(function(a, b) {
                    return a.creator.email.localeCompare(b.creator.email);
                });
            } else {
                $scope.reports.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }
        };

        $scope.executeReport = function(reportId) {
            EmailReport.execute({
                'reportId': reportId
            }, function(result) {
                $scope.success_message = 'EmailReport has been sent!';
                // TODO: better user feedback
            }, function(error) {
                $scope.error_message = 'Failed sending EmailReport!';
                console.log('error executing email report', error);
            });
        };

        $scope.deleteReport = function(index) {
            if ($scope.reports) {
                var removeReport = $scope.reports[index];
                EmailReport.delete({
                    'reportId': removeReport.id
                }, function(result) {
                    $scope.reports.splice(index, 1);
                }, function(error) {
                    $scope.alertError('failed to remove job');
                    console.log('error deleting report', error);
                });
            }
        };

        $scope.recipientList = function(report) {
            var addrs = [];

            if (report) {
                report.recipients.forEach(function(recipient) {
                    addrs.push(recipient.email);
                });
                addrs = addrs.concat(report.email_addresses).sort();
            }

            return addrs;
        };

        // start by showing all
        $scope.filter($scope.filterMode);

    }
]);

EmailReportControllers.controller('EmailReportDetail', ['$scope', '$routeParams', '$location', 'EmailReport', 'EmailReportUtils', 'Metabase',
    function($scope, $routeParams, $location, EmailReport, EmailReportUtils, Metabase) {

        // $scope.report
        // $scope.success_message
        // $scope.error_message

        $scope.save = function(reportDetail) {
            $scope.clearStatus();

            // we need to ensure our recipients list is properly set on the report
            var recipients = [];
            $scope.form_input.users.forEach(function(user) {
                if (user.incl) recipients.push(user.id);
            });
            reportDetail.recipients = recipients;

            if ($scope.report.id) {
                // if there is already an ID associated with the report then we are updating
                EmailReport.update(reportDetail, function(result) {
                    $scope.report = result;

                    // alert
                    $scope.success_message = 'EmailReport saved successfully!';
                }, function(error) {
                    $scope.error_message = 'Failed saving EmailReport!';
                    console.log('error updating email report', error);
                });
            } else {
                // otherwise we are creating a new report
                reportDetail.organization = $scope.currentOrg.id;

                EmailReport.create(reportDetail, function(result) {
                    $scope.report = result;

                    // move the user over the the actual page for the new report
                    $location.path('/' + $scope.currentOrg.slug + '/admin/emailreport/' + result.id);
                }, function(error) {
                    $scope.error_message = 'Failed saving EmailReport!';
                    console.log('error creating email report', error);
                });
            }

        };

        $scope.executeReport = function(reportId) {
            $scope.clearStatus();

            EmailReport.execute({
                'reportId': reportId
            }, function(result) {
                $scope.success_message = 'EmailReport has been sent!';
            }, function(error) {
                $scope.error_message = 'Failed sending EmailReport!';
                console.log('error executing email report', error);
            });
        };

        $scope.clearStatus = function() {
            $scope.success_message = undefined;
            $scope.error_message = undefined;
        };

        $scope.refreshTableList = function(dbId) {
            Metabase.db_tables({
                'dbId': dbId
            }, function(tables) {
                $scope.tables = tables;
            }, function(error) {
                console.log('error getting tables', error);
            });
        };

        $scope.$watch('report.schedule', function(schedule) {
            if (!schedule) return;

            $scope.human_readable_schedule = EmailReportUtils.humanReadableSchedule(schedule);
        }, true);

        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            EmailReport.form_input({
                'orgId': org.id
            }, function(form_input) {
                $scope.form_input = form_input;

                if ($routeParams.reportId) {
                    // fetch the Job data
                    EmailReport.get({
                        'reportId': $routeParams.reportId
                    }, function(result) {
                        // Short term hack.  need to convert dataset_query into string
                        $scope.report = result;

                        // initialize our recipients controls
                        // TODO: this is a little annoying, but I didn't see an easier way to do this
                        $scope.form_input.users.forEach(function(user) {
                            result.recipients.forEach(function(recipient) {
                                if (recipient.id === user.id) {
                                    user.incl = true;
                                }
                            });
                        });

                        // we also need our table list at this point
                        $scope.refreshTableList(result.dataset_query.database);

                    }, function(error) {
                        console.log(error);
                        if (error.status == 404) {
                            $location.path('/');
                        }
                    });
                } else {
                    // user must be creating a new EmailReport, so start them off with a basic template
                    $scope.report = {
                        "name": "",
                        "mode": form_input.modes[0].id,
                        "public_perms": form_input.permissions[2].id,
                        "email_addresses": "",
                        "recipients": [],
                        "dataset_query": {
                            "type": "query",
                            "query": {
                                "source_table": 0,
                                "filter": [null, null],
                                "aggregation": ["rows"],
                                "breakout": [null],
                                "limit": null
                            }
                        },
                        "schedule": {
                            "days_of_week": {
                                "mon": true,
                                "tue": true,
                                "wed": true,
                                "thu": true,
                                "fri": true,
                                "sat": true,
                                "sun": true
                            },
                            "time_of_day": "morning",
                            "timezone": ""
                        }
                    };

                    // initialize all of our possible team members as not being recipients right now
                    $scope.form_input.users.forEach(function(user) {
                        user.incl = false;
                    });
                }
            }, function(error) {
                console.log('error getting EmailReport form_input', error);
            });
        });
    }
]);

EmailReportControllers.controller('EmailReportExecList', ['$scope', '$routeParams', '$interval', 'EtlJobExec',
    function($scope, $routeParams, $interval, EtlJobExec) {

        // $scope.jobexecs
        $scope.filterMode = 'all';
        $scope.sortMode = 'lastexec';
        var jobMonitor;

        $scope.filter = function(mode) {
            $scope.filterMode = mode;

            EtlJobExec.list({
                'filterMode': mode
            }, function(result) {
                $scope.jobexecs = result;

                $scope.sort();
            });
        };

        $scope.sort = function() {
            if ('table_name' == $scope.sortMode) {
                $scope.jobexecs.sort(function(a, b) {
                    return a.details.table_name.localeCompare(b.details.table_name);
                });
            } else if ('owner' == $scope.sortMode) {
                $scope.jobexecs.sort(function(a, b) {
                    return a.job.creator.email.localeCompare(b.job.creator.email);
                });
            } else if ('name' == $scope.sortMode) {
                $scope.jobexecs.sort(function(a, b) {
                    return a.job.name.localeCompare(b.job.name);
                });
            } else {
                // default mode is by last exec descending
                $scope.jobexecs.sort(function(a, b) {
                    a = new Date(a.created_at);
                    b = new Date(b.created_at);

                    return a > b ? -1 : a < b ? 1 : 0;
                });
            }
        };

        $scope.canceljobMonitor = function() {
            if (angular.isDefined(jobMonitor)) {
                $interval.cancel(jobMonitor);
                jobMonitor = undefined;
            }
        };

        // determine the appropriate filter to start with
        $scope.filter($scope.filterMode);

        $scope.$on('$destroy', function() {
            $scope.canceljobMonitor();
        });

        // start an interval which will refresh our listing periodically
        jobMonitor = $interval(function() {
            $scope.filter($scope.filterMode);
        }, 30000);
    }
]);
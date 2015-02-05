'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

var ReserveServices = angular.module('corvus.reserve.services', []);

ReserveServices.service('Reserve', ['$resource', '$q', 'Metabase',
    function($resource, $q, Metabase) {


        var RESERVE_DB_NAME = "reserve";

        var VENUE_TABLE_NAME = "rh_reserve_venue_entity";
        var VENUE_ID_FIELD_NAME = "id";
        var VENUE_NAME_FIELD_NAME = "name";

        var BOOKING_TABLE_NAME = "booking";
        var BOOKING_ID_FIELD_NAME = "id";
        var BOOKING_VENUE_FK_NAME = "venue";
        var BOOKING_USER_FK_NAME = "user";
        var BOOKING_GUESTS_FIELD_NAME = "guests";
        var BOOKING_OVERAGE_FIELD_NAME = "overage";
        var BOOKING_RATING_FIELD_NAME = "rating";
        var BOOKING_CREATED_AT_FIELD_NAME = "createdAt";
        var BOOKING_UPDATED_AT_FIELD_NAME = "updatedAt";

        var USER_TABLE_NAME = "rh_reserve_user_entity";
        var USER_ID_FIELD_NAME = "user_id";
        var USER_FIRST_NAME_FIELD_NAME = "firstName";
        var USER_LAST_NAME_FIELD_NAME = "lastName";

        this.queryInfo = function(orgId){
            var deferred = $q.defer();
            var queryInfo = {};
            Metabase.db_list({
                'orgId': orgId
            }, function(dbs){
                dbs.forEach(function(db){
                    if(db.name == RESERVE_DB_NAME){
                        queryInfo.database = db.id;
                        Metabase.db_tables({
                            dbId:db.id
                        }, function(tables){
                            tables.forEach(function(table){
                                if(table.name == VENUE_TABLE_NAME){
                                    queryInfo.venue_table = table.id;
                                }else if(table.name == BOOKING_TABLE_NAME){
                                    queryInfo.booking_table = table.id;
                                }else if(table.name == USER_TABLE_NAME){
                                    queryInfo.user_table = table.id;
                                }
                            });

                            Metabase.table_fields({
                                tableId: queryInfo.venue_table
                            }, function(venueTableFields){
                                venueTableFields.forEach(function(field){
                                    if(field.name == VENUE_ID_FIELD_NAME){
                                        queryInfo.venue_id_field = field.id;
                                    }else if(field.name == VENUE_NAME_FIELD_NAME){
                                        queryInfo.venue_name_field = field.id;
                                    }
                                });

                                Metabase.table_fields({
                                    tableId: queryInfo.booking_table
                                }, function(bookingTableFields){
                                    bookingTableFields.forEach(function(field){
                                        if(field.name == BOOKING_ID_FIELD_NAME){
                                            queryInfo.booking_id_field = field.id;
                                        }else if(field.name == BOOKING_VENUE_FK_NAME){
                                            queryInfo.booking_venue_fk = field.id;
                                        }else if(field.name == BOOKING_USER_FK_NAME){
                                            queryInfo.booking_user_fk = field.id;
                                        }else if(field.name == BOOKING_GUESTS_FIELD_NAME){
                                            queryInfo.booking_guests_field = field.id;
                                        }else if(field.name == BOOKING_OVERAGE_FIELD_NAME){
                                            queryInfo.booking_overage_field = field.id;
                                        }else if(field.name == BOOKING_RATING_FIELD_NAME){
                                            queryInfo.booking_rating_field = field.id;
                                        }else if(field.name == BOOKING_CREATED_AT_FIELD_NAME){
                                            queryInfo.booking_createdAt_field = field.id;
                                        }else if(field.name == BOOKING_UPDATED_AT_FIELD_NAME){
                                            queryInfo.booking_updatedAt_field = field.id;
                                        }
                                    });

                                    Metabase.table_fields({
                                        tableId: queryInfo.user_table
                                    }, function(userTableFields){
                                        userTableFields.forEach(function(field){
                                            if(field.name == USER_ID_FIELD_NAME){
                                                queryInfo.user_id_field = field.id;
                                                deferred.resolve(queryInfo);
                                            }else if(field.name == USER_FIRST_NAME_FIELD_NAME){
                                                queryInfo.user_firstName_field = field.id;
                                            }else if(field.name == USER_LAST_NAME_FIELD_NAME){
                                                queryInfo.user_lastName_field = field.id;
                                            }
                                        });
                                    });
                                });

                            });
                        });
                    }
                });
            });

            return deferred.promise;
        };

        this.convertToObjects = function (data) {
            var rows = [];
            for (var i = 0; i < data.rows.length; i++) {
                var row = {};

                for (var j = 0; j < data.cols.length; j++) {
                    var coldef = data.cols[j];

                    row[coldef.name] = data.rows[i][j];
                }

                rows.push(row);
            }

            return rows;
        };

    }
]);

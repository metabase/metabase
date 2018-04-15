# API Documentation for Metabase v0.27.0-snapshot

## `GET /api/activity/`

Get recent activity.


## `GET /api/activity/recent_views`

Get the list of 10 things the current user has been viewing most recently.


## `DELETE /api/alert/:id`

Remove an alert

##### PARAMS:

*  **`id`** 


## `GET /api/alert/`

Fetch all alerts


## `GET /api/alert/question/:id`

Fetch all questions for the given question (`Card`) id

##### PARAMS:

*  **`id`** 


## `POST /api/alert/`

Create a new alert (`Pulse`)

##### PARAMS:

*  **`alert_condition`** value must be one of: `goal`, `rows`.

*  **`card`** value must be a map.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`alert_first_only`** value must be a boolean.

*  **`alert_above_goal`** value may be nil, or if non-nil, value must be a boolean.

*  **`req`** 


## `PUT /api/alert/:id`

Update a `Alert` with ID.

##### PARAMS:

*  **`id`** 

*  **`alert_condition`** value must be one of: `goal`, `rows`.

*  **`card`** value must be a map.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`alert_first_only`** value must be a boolean.

*  **`alert_above_goal`** value may be nil, or if non-nil, value must be a boolean.

*  **`req`** 


## `PUT /api/alert/:id/unsubscribe`

Unsubscribes a user from the given alert

##### PARAMS:

*  **`id`** 


## `GET /api/async/:id`

Get result of async computation job with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/async/running-jobs`

Get all running jobs belonging to the current user.


## `DELETE /api/card/:card-id/favorite`

Unfavorite a Card.

##### PARAMS:

*  **`card-id`** 


## `DELETE /api/card/:card-id/public_link`

Delete the publically-accessible link to this Card.

You must be a superuser to do this.

##### PARAMS:

*  **`card-id`** 


## `DELETE /api/card/:id`

Delete a `Card`.

##### PARAMS:

*  **`id`** 


## `GET /api/card/`

Get all the `Cards`. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `fav`, `database`, `table`, `recent`, `popular`, and `archived`. See
  corresponding implementation functions above for the specific behavior of each filter option. :card_index:

  Optionally filter cards by LABEL or COLLECTION slug. (COLLECTION can be a blank string, to signify cards with *no
  collection* should be returned.)

  NOTES:

  *  Filtering by LABEL is considered *deprecated*, as `Labels` will be removed from an upcoming version of Metabase
     in favor of `Collections`.
  *  LABEL and COLLECTION params are mutually exclusive; if both are specified, LABEL will be ignored and Cards will
     only be filtered by their `Collection`.
  *  If no `Collection` exists with the slug COLLECTION, this endpoint will return a 404.

##### PARAMS:

*  **`f`** value may be nil, or if non-nil, value must be one of: `all`, `archived`, `database`, `fav`, `mine`, `popular`, `recent`, `table`.

*  **`model_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`label`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`collection`** value may be nil, or if non-nil, value must be a string.


## `GET /api/card/:id`

Get `Card` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/card/embeddable`

Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT.

You must be a superuser to do this.


## `GET /api/card/public`

Fetch a list of Cards with public UUIDs. These cards are publically-accessible *if* public sharing is enabled.

You must be a superuser to do this.


## `POST /api/card/`

Create a new `Card`.

##### PARAMS:

*  **`dataset_query`** 

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`display`** value must be a non-blank string.

*  **`name`** value must be a non-blank string.

*  **`visualization_settings`** value must be a map.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`result_metadata`** value may be nil, or if non-nil, value must be an array of valid results column metadata maps.

*  **`metadata_checksum`** value may be nil, or if non-nil, value must be a non-blank string.


## `POST /api/card/:card-id/favorite`

Favorite a Card.

##### PARAMS:

*  **`card-id`** 


## `POST /api/card/:card-id/labels`

Update the set of `Labels` that apply to a `Card`.
   (This endpoint is considered DEPRECATED as Labels will be removed in a future version of Metabase.)

##### PARAMS:

*  **`card-id`** 

*  **`label_ids`** value must be an array. Each value must be an integer greater than zero.


## `POST /api/card/:card-id/public_link`

Generate publically-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled.

You must be a superuser to do this.

##### PARAMS:

*  **`card-id`** 


## `POST /api/card/:card-id/query`

Run the query associated with a Card.

##### PARAMS:

*  **`card-id`** 

*  **`parameters`** 

*  **`ignore_cache`** value may be nil, or if non-nil, value must be a boolean.


## `POST /api/card/:card-id/query/:export-format`

Run the query associated with a Card, and return its results as a file in the specified format. Note that this
  expects the parameters as serialized JSON in the 'parameters' parameter

##### PARAMS:

*  **`card-id`** 

*  **`export-format`** value must be one of: `csv`, `json`, `xlsx`.

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `POST /api/card/collections`

Bulk update endpoint for Card Collections. Move a set of `Cards` with CARD_IDS into a `Collection` with
  COLLECTION_ID, or remove them from any Collections by passing a `null` COLLECTION_ID.

##### PARAMS:

*  **`card_ids`** value must be an array. Each value must be an integer greater than zero.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `PUT /api/card/:id`

Update a `Card`.

##### PARAMS:

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`result_metadata`** value may be nil, or if non-nil, value must be an array of valid results column metadata maps.

*  **`metadata_checksum`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`enable_embedding`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`embedding_params`** value may be nil, or if non-nil, value must be a valid embedding params map.

*  **`dataset_query`** value may be nil, or if non-nil, value must be a map.

*  **`id`** 

*  **`display`** value may be nil, or if non-nil, value must be a non-blank string.


## `GET /api/collection/`

Fetch a list of all Collections that the current user has read permissions for.
   This includes `:can_write`, which means whether the current user is allowed to add or remove Cards to this Collection; keep in mind
   that regardless of this status you must be a superuser to modify properties of Collections themselves.

   By default, this returns non-archived Collections, but instead you can show archived ones by passing `?archived=true`.

##### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/collection/:id`

Fetch a specific (non-archived) Collection, including cards that belong to it.

##### PARAMS:

*  **`id`** 


## `GET /api/collection/graph`

Fetch a graph of all Collection Permissions.

You must be a superuser to do this.


## `POST /api/collection/`

Create a new Collection.

You must be a superuser to do this.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`color`** value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.


## `PUT /api/collection/:id`

Modify an existing Collection, including archiving or unarchiving it.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`name`** value must be a non-blank string.

*  **`color`** value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.


## `PUT /api/collection/graph`

Do a batch update of Collections Permissions by passing in a modified graph.

You must be a superuser to do this.

##### PARAMS:

*  **`body`** value must be a map.


## `DELETE /api/dashboard/:dashboard-id/public_link`

Delete the publically-accessible link to this Dashboard.

You must be a superuser to do this.

##### PARAMS:

*  **`dashboard-id`** 


## `DELETE /api/dashboard/:id`

Delete a `Dashboard`.

##### PARAMS:

*  **`id`** 


## `DELETE /api/dashboard/:id/cards`

Remove a `DashboardCard` from a `Dashboard`.

##### PARAMS:

*  **`id`** 

*  **`dashcardId`** value must be a valid integer greater than zero.


## `DELETE /api/dashboard/:id/favorite`

Unfavorite a Dashboard.

##### PARAMS:

*  **`id`** 


## `GET /api/dashboard/`

Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:

  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.)

##### PARAMS:

*  **`f`** value may be nil, or if non-nil, value must be one of: `all`, `archived`, `mine`.


## `GET /api/dashboard/:id`

Get `Dashboard` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/dashboard/:id/revisions`

Fetch `Revisions` for `Dashboard` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/dashboard/embeddable`

Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding endpoints and a signed JWT.

You must be a superuser to do this.


## `GET /api/dashboard/public`

Fetch a list of Dashboards with public UUIDs. These dashboards are publically-accessible *if* public sharing is enabled.

You must be a superuser to do this.


## `POST /api/dashboard/`

Create a new `Dashboard`.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`parameters`** value must be an array. Each value must be a map.

*  **`dashboard`** 


## `POST /api/dashboard/:dashboard-id/public_link`

Generate publically-accessible links for this Dashboard. Returns UUID to be used in public links.
   (If this Dashboard has already been shared, it will return the existing public link rather than creating a new one.)
   Public sharing must be enabled.

You must be a superuser to do this.

##### PARAMS:

*  **`dashboard-id`** 


## `POST /api/dashboard/:id/cards`

Add a `Card` to a `Dashboard`.

##### PARAMS:

*  **`id`** 

*  **`cardId`** value must be an integer greater than zero.

*  **`parameter_mappings`** value must be an array. Each value must be a map.

*  **`series`** 

*  **`dashboard-card`** 


## `POST /api/dashboard/:id/favorite`

Favorite a Dashboard.

##### PARAMS:

*  **`id`** 


## `POST /api/dashboard/:id/revert`

Revert a `Dashboard` to a prior `Revision`.

##### PARAMS:

*  **`id`** 

*  **`revision_id`** value must be an integer greater than zero.


## `PUT /api/dashboard/:id`

Update a `Dashboard`.

   Usually, you just need write permissions for this Dashboard to do this (which means you have appropriate permissions for the Cards belonging to this Dashboard),
   but to change the value of `enable_embedding` you must be a superuser.

##### PARAMS:

*  **`parameters`** value may be nil, or if non-nil, value must be an array. Each value must be a map.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.

*  **`enable_embedding`** value may be nil, or if non-nil, value must be a boolean.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

*  **`dashboard`** 

*  **`embedding_params`** value may be nil, or if non-nil, value must be a valid embedding params map.

*  **`id`** 

*  **`position`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `PUT /api/dashboard/:id/cards`

Update `Cards` on a `Dashboard`. Request body should have the form:

    {:cards [{:id     ...
              :sizeX  ...
              :sizeY  ...
              :row    ...
              :col    ...
              :series [{:id 123
                        ...}]} ...]}

##### PARAMS:

*  **`id`** 

*  **`cards`** 


## `DELETE /api/database/:id`

Delete a `Database`.

##### PARAMS:

*  **`id`** 


## `GET /api/database/`

Fetch all `Databases`.

##### PARAMS:

*  **`include_tables`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include_cards`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/database/:id`

Get `Database` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/database/:id/autocomplete_suggestions`

Return a list of autocomplete suggestions for a given PREFIX.
   This is intened for use with the ACE Editor when the User is typing raw SQL.
   Suggestions include matching `Tables` and `Fields` in this `Database`.

   Tables are returned in the format `[table_name "Table"]`;
   Fields are returned in the format `[field_name "table_name base_type special_type"]`

##### PARAMS:

*  **`id`** 

*  **`prefix`** value must be a non-blank string.


## `GET /api/database/:id/fields`

Get a list of all `Fields` in `Database`.

##### PARAMS:

*  **`id`** 


## `GET /api/database/:id/idfields`

Get a list of all primary key `Fields` for `Database`.

##### PARAMS:

*  **`id`** 


## `GET /api/database/:id/metadata`

Get metadata about a `Database`, including all of its `Tables` and `Fields`.
   Returns DB, fields, and field values.

##### PARAMS:

*  **`id`** 


## `GET /api/database/:virtual-db/metadata`

Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database.


## `POST /api/database/`

Add a new `Database`.

You must be a superuser to do this.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`engine`** value must be a valid database engine.

*  **`details`** value must be a map.

*  **`is_full_sync`** value may be nil, or if non-nil, value must be a boolean.

*  **`is_on_demand`** value may be nil, or if non-nil, value must be a boolean.

*  **`schedules`** value may be nil, or if non-nil, value must be a valid map of schedule maps for a DB.


## `POST /api/database/:id/discard_values`

Discards all saved field values for this `Database`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/database/:id/rescan_values`

Trigger a manual scan of the field values for this `Database`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/database/:id/sync`

Update the metadata for this `Database`. This happens asynchronously.

##### PARAMS:

*  **`id`** 


## `POST /api/database/:id/sync_schema`

Trigger a manual update of the schema metadata for this `Database`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/database/sample_dataset`

Add the sample dataset as a new `Database`.

You must be a superuser to do this.


## `POST /api/database/validate`

Validate that we can connect to a database given a set of details.

You must be a superuser to do this.

##### PARAMS:

*  **`engine`** value must be a valid database engine.

*  **`details`** value must be a map.


## `PUT /api/database/:id`

Update a `Database`.

You must be a superuser to do this.

##### PARAMS:

*  **`engine`** value may be nil, or if non-nil, value must be a valid database engine.

*  **`schedules`** value may be nil, or if non-nil, value must be a valid map of schedule maps for a DB.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

*  **`is_full_sync`** 

*  **`details`** value may be nil, or if non-nil, value must be a map.

*  **`id`** 

*  **`is_on_demand`** 


## `POST /api/dataset/`

Execute a query and retrieve the results in the usual format.

##### PARAMS:

*  **`database`** value must be an integer.

*  **`query`** 


## `POST /api/dataset/:export-format`

Execute a query and download the result data as a file in the specified format.

##### PARAMS:

*  **`export-format`** value must be one of: `csv`, `json`, `xlsx`.

*  **`query`** value must be a valid JSON string.


## `POST /api/dataset/duration`

Get historical query execution duration.

##### PARAMS:

*  **`database`** 

*  **`query`** 


## `POST /api/email/test`

Send a test email. You must be a superuser to do this.

You must be a superuser to do this.


## `PUT /api/email/`

Update multiple `Settings` values.  You must be a superuser to do this.

You must be a superuser to do this.

##### PARAMS:

*  **`settings`** value must be a map.


## `GET /api/embed/card/:token`

Fetch a Card via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}}

##### PARAMS:

*  **`token`** 


## `GET /api/embed/card/:token/query`

Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}

##### PARAMS:

*  **`token`** 

*  **`&`** 

*  **`query-params`** 


## `GET /api/embed/card/:token/query/:export-format`

Like `GET /api/embed/card/query`, but returns the results as a file in the specified format.

##### PARAMS:

*  **`token`** 

*  **`export-format`** value must be one of: `csv`, `json`, `xlsx`.

*  **`&`** 

*  **`query-params`** 


## `GET /api/embed/dashboard/:token`

Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}

##### PARAMS:

*  **`token`** 


## `GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}
      :params   <parameters>}

   Additional dashboard parameters can be provided in the query string, but params in the JWT token take precedence.

##### PARAMS:

*  **`token`** 

*  **`dashcard-id`** 

*  **`card-id`** 

*  **`&`** 

*  **`query-params`** 


## `DELETE /api/field/:id/dimension`

Remove the dimension associated to field at ID

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id`

Get `Field` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id/summary`

Get the count and distinct count of `Field` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id/values`

If `Field`'s special type derives from `type/Category`, or its base type is `type/Boolean`, return
   all distinct values of the field, and a map of human-readable values defined by the user.

##### PARAMS:

*  **`id`** 


## `GET /api/field/field-literal%2C:field-name%2Ctype%2F:field-type/values`

Implementation of the field values endpoint for fields in the Saved Questions 'virtual' DB.
   This endpoint is just a convenience to simplify the frontend code. It just returns the standard
   'empty' field values response.

##### PARAMS:

*  **`_`** 


## `POST /api/field/:id/dimension`

Sets the dimension for the given field at ID

##### PARAMS:

*  **`id`** 

*  **`type`** value must be one of: `external`, `internal`.

*  **`name`** value must be a non-blank string.

*  **`human_readable_field_id`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `POST /api/field/:id/discard_values`

Discard the FieldValues belonging to this Field. Only applies to fields that have FieldValues. If this Field's
   Database is set up to automatically sync FieldValues, they will be recreated during the next cycle.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/field/:id/rescan_values`

Manually trigger an update for the FieldValues for this Field. Only applies to Fields that are eligible for
   FieldValues.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/field/:id/values`

Update the fields values and human-readable values for a `Field` whose special type is `category`/`city`/`state`/`country`
   or whose base type is `type/Boolean`. The human-readable values are optional.

##### PARAMS:

*  **`id`** 

*  **`value-pairs`** value must be an array.


## `PUT /api/field/:id`

Update `Field` with ID.

##### PARAMS:

*  **`id`** 

*  **`caveats`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`display_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`fk_target_field_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`special_type`** value may be nil, or if non-nil, value must be a valid field type.

*  **`visibility_type`** value may be nil, or if non-nil, value must be one of: `details-only`, `hidden`, `normal`, `retired`, `sensitive`.


## `GET /api/geojson/:key`

Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the file specified for KEY).

##### PARAMS:

*  **`key`** value must be a non-blank string.


## `GET /api/getting-started/`

Fetch basic info for the Getting Started guide.


## `DELETE /api/label/:id`

[DEPRECATED] Delete a `Label`. :label:

##### PARAMS:

*  **`id`** 


## `GET /api/label/`

[DEPRECATED] List all `Labels`. :label:


## `POST /api/label/`

[DEPRECATED] Create a new `Label`. :label:

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`icon`** value may be nil, or if non-nil, value must be a non-blank string.


## `PUT /api/label/:id`

[DEPRECATED] Update a `Label`. :label:

##### PARAMS:

*  **`id`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`icon`** value may be nil, or if non-nil, value must be a non-blank string.


## `PUT /api/ldap/settings`

Update LDAP related settings. You must be a superuser to do this.

You must be a superuser to do this.

##### PARAMS:

*  **`settings`** value must be a map.


## `DELETE /api/metric/:id`

Delete a `Metric`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`revision_message`** value must be a non-blank string.


## `GET /api/metric/`

Fetch *all* `Metrics`.

##### PARAMS:

*  **`id`** 


## `GET /api/metric/:id`

Fetch `Metric` with ID.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `GET /api/metric/:id/revisions`

Fetch `Revisions` for `Metric` with ID.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/metric/`

Create a new `Metric`.

You must be a superuser to do this.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** 

*  **`table_id`** value must be an integer greater than zero.

*  **`definition`** value must be a map.


## `POST /api/metric/:id/revert`

Revert a `Metric` to a prior `Revision`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`revision_id`** value must be an integer greater than zero.


## `PUT /api/metric/:id`

Update a `Metric` with ID.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`definition`** value must be a map.

*  **`name`** value must be a non-blank string.

*  **`revision_message`** value must be a non-blank string.


## `PUT /api/metric/:id/important_fields`

Update the important `Fields` for a `Metric` with ID.
   (This is used for the Getting Started guide).

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`important_field_ids`** value must be an array. Each value must be an integer greater than zero.


## `POST /api/notify/db/:id`

Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single `Table`.

##### PARAMS:

*  **`id`** 

*  **`table_id`** 

*  **`table_name`** 


## `DELETE /api/permissions/group/:group-id`

Delete a specific `PermissionsGroup`.

You must be a superuser to do this.

##### PARAMS:

*  **`group-id`** 


## `DELETE /api/permissions/membership/:id`

Remove a User from a PermissionsGroup (delete their membership).

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `GET /api/permissions/graph`

Fetch a graph of all Permissions.

You must be a superuser to do this.


## `GET /api/permissions/group`

Fetch all `PermissionsGroups`, including a count of the number of `:members` in that group.

You must be a superuser to do this.


## `GET /api/permissions/group/:id`

Fetch the details for a certain permissions group.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `GET /api/permissions/membership`

Fetch a map describing the group memberships of various users.
   This map's format is:

    {<user-id> [{:membership_id <id>
                 :group_id      <id>}]}

You must be a superuser to do this.


## `POST /api/permissions/group`

Create a new `PermissionsGroup`.

You must be a superuser to do this.

##### PARAMS:

*  **`name`** value must be a non-blank string.


## `POST /api/permissions/membership`

Add a `User` to a `PermissionsGroup`. Returns updated list of members belonging to the group.

You must be a superuser to do this.

##### PARAMS:

*  **`group_id`** value must be an integer greater than zero.

*  **`user_id`** value must be an integer greater than zero.


## `PUT /api/permissions/graph`

Do a batch update of Permissions by passing in a modified graph. This should return the same graph,
   in the same format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever neccesary.
   This modified graph must correspond to the `PermissionsGraph` schema.
   If successful, this endpoint returns the updated permissions graph; use this as a base for any further modifications.

   Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party modifies it before you can submit
   you revisions, the endpoint will instead make no changes andr eturn a 409 (Conflict) response. In this case, you should fetch the updated graph
   and make desired changes to that.

You must be a superuser to do this.

##### PARAMS:

*  **`body`** value must be a map.


## `PUT /api/permissions/group/:group-id`

Update the name of a `PermissionsGroup`.

You must be a superuser to do this.

##### PARAMS:

*  **`group-id`** 

*  **`name`** value must be a non-blank string.


## `GET /api/preview-embed/card/:token`

Fetch a Card you're considering embedding by passing a JWT TOKEN.

##### PARAMS:

*  **`token`** 


## `GET /api/preview-embed/card/:token/query`

Fetch the query results for a Card you're considering embedding by passing a JWT TOKEN.

##### PARAMS:

*  **`token`** 

*  **`&`** 

*  **`query-params`** 


## `GET /api/preview-embed/dashboard/:token`

Fetch a Dashboard you're considering embedding by passing a JWT TOKEN. 

##### PARAMS:

*  **`token`** 


## `GET /api/preview-embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT TOKEN.

##### PARAMS:

*  **`token`** 

*  **`dashcard-id`** 

*  **`card-id`** 

*  **`&`** 

*  **`query-params`** 


## `GET /api/public/card/:uuid`

Fetch a publically-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 


## `GET /api/public/card/:uuid/query`

Fetch a publically-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `GET /api/public/card/:uuid/query/:export-format`

Fetch a publically-accessible Card and return query results in the specified format. Does not require auth
   credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 

*  **`export-format`** value must be one of: `csv`, `json`, `xlsx`.

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `GET /api/public/dashboard/:uuid`

Fetch a publically-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 


## `GET /api/public/dashboard/:uuid/card/:card-id`

Fetch the results for a Card in a publically-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled.

##### PARAMS:

*  **`uuid`** 

*  **`card-id`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `GET /api/public/oembed`

oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL.

##### PARAMS:

*  **`url`** value must be a non-blank string.

*  **`format`** value may be nil, or if non-nil, value must be one of: `json`.

*  **`maxheight`** value may be nil, or if non-nil, value must be a valid integer.

*  **`maxwidth`** value may be nil, or if non-nil, value must be a valid integer.


## `DELETE /api/pulse/:id`

Delete a `Pulse`.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/`

Fetch all `Pulses`


## `GET /api/pulse/:id`

Fetch `Pulse` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/form_input`

Provides relevant configuration information and user choices for creating/updating `Pulses`.


## `GET /api/pulse/preview_card/:id`

Get HTML rendering of a `Card` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/preview_card_info/:id`

Get JSON object containing HTML rendering of a `Card` with ID and other information.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/preview_card_png/:id`

Get PNG rendering of a `Card` with ID.

##### PARAMS:

*  **`id`** 


## `POST /api/pulse/`

Create a new `Pulse`.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value must be a boolean.


## `POST /api/pulse/test`

Test send an unsaved pulse.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value must be a boolean.


## `PUT /api/pulse/:id`

Update a `Pulse` with ID.

##### PARAMS:

*  **`id`** 

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value must be a boolean.


## `GET /api/revision/`

Get revisions of an object.

##### PARAMS:

*  **`entity`** value must be one of: `card`, `dashboard`.

*  **`id`** value must be an integer.


## `POST /api/revision/revert`

Revert an object to a prior revision.

##### PARAMS:

*  **`entity`** value must be one of: `card`, `dashboard`.

*  **`id`** value must be an integer.

*  **`revision_id`** value must be an integer.


## `DELETE /api/segment/:id`

Delete a `Segment`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`revision_message`** value must be a non-blank string.


## `GET /api/segment/`

Fetch *all* `Segments`.


## `GET /api/segment/:id`

Fetch `Segment` with ID.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `GET /api/segment/:id/revisions`

Fetch `Revisions` for `Segment` with ID.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/segment/`

Create a new `Segment`.

You must be a superuser to do this.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** 

*  **`table_id`** value must be an integer greater than zero.

*  **`definition`** value must be a map.


## `POST /api/segment/:id/revert`

Revert a `Segement` to a prior `Revision`.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`revision_id`** value must be an integer greater than zero.


## `PUT /api/segment/:id`

Update a `Segment` with ID.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 

*  **`name`** value must be a non-blank string.

*  **`definition`** value must be a map.

*  **`revision_message`** value must be a non-blank string.


## `DELETE /api/session/`

Logout.

##### PARAMS:

*  **`session_id`** value must be a non-blank string.


## `GET /api/session/password_reset_token_valid`

Check is a password reset token is valid and isn't expired.

##### PARAMS:

*  **`token`** value must be a string.


## `GET /api/session/properties`

Get all global properties and their values. These are the specific `Settings` which are meant to be public.


## `POST /api/session/`

Login.

##### PARAMS:

*  **`username`** value must be a non-blank string.

*  **`password`** value must be a non-blank string.

*  **`remote-address`** 


## `POST /api/session/forgot_password`

Send a reset email when user has forgotten their password.

##### PARAMS:

*  **`server-name`** 

*  **`email`** value must be a valid email address.

*  **`remote-address`** 


## `POST /api/session/google_auth`

Login with Google Auth.

##### PARAMS:

*  **`token`** value must be a non-blank string.

*  **`remote-address`** 


## `POST /api/session/reset_password`

Reset password with a reset token.

##### PARAMS:

*  **`token`** value must be a non-blank string.

*  **`password`** Insufficient password strength


## `GET /api/setting/`

Get all `Settings` and their values. You must be a superuser to do this.

You must be a superuser to do this.


## `GET /api/setting/:key`

Fetch a single `Setting`. You must be a superuser to do this.

You must be a superuser to do this.

##### PARAMS:

*  **`key`** value must be a non-blank string.


## `PUT /api/setting/:key`

Create/update a `Setting`. You must be a superuser to do this.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`.

You must be a superuser to do this.

##### PARAMS:

*  **`key`** value must be a non-blank string.

*  **`value`** 


## `GET /api/setup/admin_checklist`

Return various "admin checklist" steps and whether they've been completed. You must be a superuser to see this!

You must be a superuser to do this.


## `POST /api/setup/`

Special endpoint for creating the first user during setup.
   This endpoint both creates the user AND logs them in and returns a session ID.

##### PARAMS:

*  **`engine`** 

*  **`schedules`** value may be nil, or if non-nil, value must be a valid map of schedule maps for a DB.

*  **`allow_tracking`** value may be nil, or if non-nil, value must satisfy one of the following requirements: 1) value must be a boolean. 2) value must be a valid boolean string ('true' or 'false').

*  **`email`** value must be a valid email address.

*  **`first_name`** value must be a non-blank string.

*  **`password`** Insufficient password strength

*  **`name`** 

*  **`is_full_sync`** 

*  **`site_name`** value must be a non-blank string.

*  **`token`** Token does not match the setup token.

*  **`details`** 

*  **`is_on_demand`** 

*  **`last_name`** value must be a non-blank string.


## `POST /api/setup/validate`

Validate that we can connect to a database given a set of details.

##### PARAMS:

*  **`engine`** value must be a valid database engine.

*  **`host`** 

*  **`port`** 

*  **`details`** 

*  **`token`** Token does not match the setup token.


## `PUT /api/slack/settings`

Update Slack related settings. You must be a superuser to do this.

You must be a superuser to do this.

##### PARAMS:

*  **`slack-token`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`metabot-enabled`** value must be a boolean.

*  **`slack-settings`** 


## `GET /api/table/`

Get all `Tables`.


## `GET /api/table/:id`

Get `Table` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/table/:id/fks`

Get all foreign keys whose destination is a `Field` that belongs to this `Table`.

##### PARAMS:

*  **`id`** 


## `GET /api/table/:id/query_metadata`

Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case
  will any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page).

##### PARAMS:

*  **`id`** 

*  **`include_sensitive_fields`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/table/card__:id/fks`

Return FK info for the 'virtual' table for a Card. This is always empty, so this endpoint
   serves mainly as a placeholder to avoid having to change anything on the frontend.


## `GET /api/table/card__:id/query_metadata`

Return metadata for the 'virtual' table for a Card.

##### PARAMS:

*  **`id`** 


## `POST /api/table/:id/discard_values`

Discard the FieldValues belonging to the Fields in this Table. Only applies to fields that have FieldValues. If
   this Table's Database is set up to automatically sync FieldValues, they will be recreated during the next cycle.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `POST /api/table/:id/rescan_values`

Manually trigger an update for the FieldValues for the Fields belonging to this Table. Only applies to Fields that
   are eligible for FieldValues.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `PUT /api/table/:id`

Update `Table` with ID.

##### PARAMS:

*  **`id`** 

*  **`display_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`entity_type`** value may be nil, or if non-nil, value must be one of: `event`, `person`, `photo`, `place`.

*  **`visibility_type`** value may be nil, or if non-nil, value must be one of: `cruft`, `hidden`, `technical`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.


## `GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/`

This endpoints provides an image with the appropriate pins rendered given a MBQL QUERY (passed as a GET query string param).
   We evaluate the query and find the set of lat/lon pairs which are relevant and then render the appropriate ones.
   It's expected that to render a full map view several calls will be made to this endpoint in parallel.

##### PARAMS:

*  **`zoom`** value must be a valid integer.

*  **`x`** value must be a valid integer.

*  **`y`** value must be a valid integer.

*  **`lat-field-id`** value must be an integer greater than zero.

*  **`lon-field-id`** value must be an integer greater than zero.

*  **`lat-col-idx`** value must be a valid integer.

*  **`lon-col-idx`** value must be a valid integer.

*  **`query`** value must be a valid JSON string.


## `DELETE /api/user/:id`

Disable a `User`.  This does not remove the `User` from the DB, but instead disables their account.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `GET /api/user/`

Fetch a list of all active `Users` for the admin People page.


## `GET /api/user/:id`

Fetch a `User`. You must be fetching yourself *or* be a superuser.

##### PARAMS:

*  **`id`** 


## `GET /api/user/current`

Fetch the current `User`.


## `POST /api/user/`

Create a new `User`, or reactivate an existing one.

You must be a superuser to do this.

##### PARAMS:

*  **`first_name`** value must be a non-blank string.

*  **`last_name`** value must be a non-blank string.

*  **`email`** value must be a valid email address.

*  **`password`** 


## `POST /api/user/:id/send_invite`

Resend the user invite email for a given user.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `PUT /api/user/:id`

Update a `User`.

##### PARAMS:

*  **`id`** 

*  **`email`** value must be a valid email address.

*  **`first_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`last_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`is_superuser`** 


## `PUT /api/user/:id/password`

Update a user's password.

##### PARAMS:

*  **`id`** 

*  **`password`** Insufficient password strength

*  **`old_password`** 


## `PUT /api/user/:id/qbnewb`

Indicate that a user has been informed about the vast intricacies of 'the' Query Builder.

##### PARAMS:

*  **`id`** 


## `GET /api/util/logs`

Logs.

You must be a superuser to do this.


## `GET /api/util/random_token`

Return a cryptographically secure random 32-byte token, encoded as a hexidecimal string.
   Intended for use when creating a value for `embedding-secret-key`.


## `GET /api/util/stats`

Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home.

You must be a superuser to do this.


## `POST /api/util/password_check`

Endpoint that checks if the supplied password meets the currently configured password complexity rules.

##### PARAMS:

*  **`password`** Insufficient password strength


## `GET /api/x-ray/card/:id`

X-ray a card.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/card/:card-id/segment/:segment-id`

Get comparison x-ray of a card and a segment.

##### PARAMS:

*  **`card-id`** 

*  **`segment-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/card/:card-id/table/:table-id`

Get comparison x-ray of a table and a card.

##### PARAMS:

*  **`card-id`** 

*  **`table-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/cards/:card1-id/:card2-id`

Get comparison x-ray of two cards.

##### PARAMS:

*  **`card1-id`** 

*  **`card2-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/fields/:field1-id/:field2-id`

Get comparison x-ray of two fields.

##### PARAMS:

*  **`field1-id`** 

*  **`field2-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/segment/:segment-id/card/:card-id`

Get comparison x-ray of a card and a segment.

##### PARAMS:

*  **`segment-id`** 

*  **`card-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/segment/:segment-id/table/:table-id`

Get comparison x-ray of a table and a segment.

##### PARAMS:

*  **`segment-id`** 

*  **`table-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/segments/:segment1-id/:segment2-id`

Get comparison x-ray of two segments.

##### PARAMS:

*  **`segment1-id`** 

*  **`segment2-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/table/:table-id/card/:card-id`

Get comparison x-ray of a table and a card.

##### PARAMS:

*  **`table-id`** 

*  **`card-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/table/:table-id/segment/:segment-id`

Get comparison x-ray of a table and a segment.

##### PARAMS:

*  **`table-id`** 

*  **`segment-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/compare/tables/:table1-id/:table2-id`

Get comparison x-ray of two tables.

##### PARAMS:

*  **`table1-id`** 

*  **`table2-id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/field/:id`

X-ray a field.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/metric/:id`

X-ray a metric.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/segment/:id`

X-ray a segment.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `GET /api/x-ray/table/:id`

X-ray a table.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.


## `POST /api/x-ray/compare/card/:id/query`

Get comparison x-ray of card and ad-hoc query.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.

*  **`query`** 


## `POST /api/x-ray/compare/segment/:id/query`

Get comparison x-ray of segment and ad-hoc query.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.

*  **`query`** 


## `POST /api/x-ray/compare/table/:id/query`

Get comparison x-ray of table and ad-hoc query.

##### PARAMS:

*  **`id`** 

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.

*  **`query`** 


## `POST /api/x-ray/query`

X-ray a query.

##### PARAMS:

*  **`max_query_cost`** value may be nil, or if non-nil, value must be one of: `cache`, `full-scan`, `joins`, `sample`.

*  **`max_computation_cost`** value may be nil, or if non-nil, value must be one of: `linear`, `unbounded`, `yolo`.

*  **`query`** 
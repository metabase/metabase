# API Documentation for Metabase v0.30.0-snapshot

## `GET /api/activity/`

Get recent activity.


## `GET /api/activity/recent_views`

Get the list of 10 things the current user has been viewing most recently.


## `DELETE /api/alert/:id`

Delete an Alert. (DEPRECATED -- don't delete a Alert anymore -- archive it instead.)

##### PARAMS:

*  **`id`** 


## `GET /api/alert/`

Fetch all alerts

##### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/alert/question/:id`

Fetch all questions for the given question (`Card`) id

##### PARAMS:

*  **`id`** 


## `POST /api/alert/`

Create a new Alert.

##### PARAMS:

*  **`alert_condition`** value must be one of: `goal`, `rows`.

*  **`card`** value must be a map with the keys `id`, `include_csv`, and `include_xls`.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`alert_first_only`** value must be a boolean.

*  **`alert_above_goal`** value may be nil, or if non-nil, value must be a boolean.

*  **`new-alert-request-body`** 


## `PUT /api/alert/:id`

Update a `Alert` with ID.

##### PARAMS:

*  **`id`** 

*  **`alert_condition`** value may be nil, or if non-nil, value must be one of: `goal`, `rows`.

*  **`card`** value may be nil, or if non-nil, value must be a map with the keys `id`, `include_csv`, and `include_xls`.

*  **`channels`** value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty.

*  **`alert_first_only`** value may be nil, or if non-nil, value must be a boolean.

*  **`alert_above_goal`** value may be nil, or if non-nil, value must be a boolean.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`alert-updates`** 


## `PUT /api/alert/:id/unsubscribe`

Unsubscribes a user from the given alert

##### PARAMS:

*  **`id`** 


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query`

Return an automagic dashboard for entity `entity` with id `ìd`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`show`** invalid show value


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query`

Return an automagic dashboard analyzing cell in  automagic dashboard for entity `entity`
   defined by
   query `cell-querry`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`cell-query`** value couldn't be parsed as base64 encoded JSON

*  **`show`** invalid show value


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `ìd` defined by query `cell-querry`; compared with entity `comparison-entity` with id
   `comparison-entity-id-or-query.`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`cell-query`** value couldn't be parsed as base64 encoded JSON

*  **`show`** invalid show value

*  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc"

*  **`comparison-entity-id-or-query`** 


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:rule`

Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry` using rule `rule`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`cell-query`** value couldn't be parsed as base64 encoded JSON

*  **`prefix`** invalid value for prefix

*  **`rule`** invalid value for rule name

*  **`show`** invalid show value


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:rule/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `ìd` defined by query `cell-querry` using rule `rule`; compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`cell-query`** value couldn't be parsed as base64 encoded JSON

*  **`prefix`** invalid value for prefix

*  **`rule`** invalid value for rule name

*  **`show`** invalid show value

*  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc"

*  **`comparison-entity-id-or-query`** 


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for entity `entity` with id `ìd` compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`show`** invalid show value

*  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc"

*  **`comparison-entity-id-or-query`** 


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/rule/:prefix/:rule`

Return an automagic dashboard for entity `entity` with id `ìd` using rule `rule`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`prefix`** invalid value for prefix

*  **`rule`** invalid value for rule name

*  **`show`** invalid show value


## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/rule/:prefix/:rule/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for entity `entity` with id `ìd` using rule `rule`;
   compared with entity `comparison-entity` with id `comparison-entity-id-or-query.`.

##### PARAMS:

*  **`entity`** Invalid entity type

*  **`entity-id-or-query`** 

*  **`prefix`** invalid value for prefix

*  **`rule`** invalid value for rule name

*  **`show`** invalid show value

*  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc"

*  **`comparison-entity-id-or-query`** 


## `GET /api/automagic-dashboards/database/:id/candidates`

Return a list of candidates for automagic dashboards orderd by interestingness.

##### PARAMS:

*  **`id`** 


## `DELETE /api/card/:card-id/favorite`

Unfavorite a Card.

##### PARAMS:

*  **`card-id`** 


## `DELETE /api/card/:card-id/public_link`

Delete the publicly-accessible link to this Card.

You must be a superuser to do this.

##### PARAMS:

*  **`card-id`** 


## `DELETE /api/card/:id`

Delete a Card. (DEPRECATED -- don't delete a Card anymore -- archive it instead.)

##### PARAMS:

*  **`id`** 


## `GET /api/card/`

Get all the Cards. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `fav`, `database`, `table`, `recent`, `popular`, and `archived`. See
  corresponding implementation functions above for the specific behavior of each filter option. :card_index:

##### PARAMS:

*  **`f`** value may be nil, or if non-nil, value must be one of: `all`, `archived`, `database`, `fav`, `mine`, `popular`, `recent`, `table`.

*  **`model_id`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `GET /api/card/:id`

Get `Card` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/card/:id/related`

Return related entities.

##### PARAMS:

*  **`id`** 


## `GET /api/card/embeddable`

Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT.

You must be a superuser to do this.


## `GET /api/card/public`

Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled.

You must be a superuser to do this.


## `POST /api/card/`

Create a new `Card`.

##### PARAMS:

*  **`visualization_settings`** value must be a map.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`result_metadata`** value may be nil, or if non-nil, value must be an array of valid results column metadata maps.

*  **`metadata_checksum`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`name`** value must be a non-blank string.

*  **`dataset_query`** 

*  **`display`** value must be a non-blank string.


## `POST /api/card/:card-id/favorite`

Favorite a Card.

##### PARAMS:

*  **`card-id`** 


## `POST /api/card/:card-id/public_link`

Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
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


## `POST /api/card/related`

Return related entities for an ad-hoc query.

##### PARAMS:

*  **`query`** 


## `PUT /api/card/:id`

Update a `Card`.

##### PARAMS:

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`result_metadata`** value may be nil, or if non-nil, value must be an array of valid results column metadata maps.

*  **`metadata_checksum`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`enable_embedding`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`card-updates`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`embedding_params`** value may be nil, or if non-nil, value must be a valid embedding params map.

*  **`dataset_query`** value may be nil, or if non-nil, value must be a map.

*  **`id`** 

*  **`display`** value may be nil, or if non-nil, value must be a non-blank string.


## `GET /api/collection/`

Fetch a list of all Collections that the current user has read permissions for (`:can_write` is returned as an
  additional property of each Collection so you can tell which of these you have write permissions for.)

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`.

##### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/collection/:id`

Fetch a specific Collection with standard details added

##### PARAMS:

*  **`id`** 


## `GET /api/collection/:id/items`

Fetch a specific Collection's items with the following options:

  *  `model` - only include objects of a specific `model`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`.

##### PARAMS:

*  **`id`** 

*  **`model`** value may be nil, or if non-nil, value must be one of: `card`, `collection`, `dashboard`, `pulse`.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/collection/graph`

Fetch a graph of all Collection Permissions.

You must be a superuser to do this.


## `GET /api/collection/root`

Return the 'Root' Collection object with standard details added


## `GET /api/collection/root/items`

Fetch objects that the current user should see at their root level. As mentioned elsewhere, the 'Root' Collection
  doesn't actually exist as a row in the application DB: it's simply a virtual Collection where things with no
  `collection_id` exist. It does, however, have its own set of Permissions.

  This endpoint will actually show objects with no `collection_id` for Users that have Root Collection
  permissions, but for people without Root Collection perms, we'll just show the objects that have an effective
  location of `/`.

  This endpoint is intended to power a 'Root Folder View' for the Current User, so regardless you'll see all the
  top-level objects you're allowed to access.

##### PARAMS:

*  **`model`** value may be nil, or if non-nil, value must be one of: `card`, `collection`, `dashboard`, `pulse`.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `POST /api/collection/`

Create a new Collection.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`color`** value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`parent_id`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `PUT /api/collection/:id`

Modify an existing Collection, including archiving or unarchiving it, or moving it.

##### PARAMS:

*  **`id`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`color`** value may be nil, or if non-nil, value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`parent_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection-updates`** 


## `PUT /api/collection/graph`

Do a batch update of Collections Permissions by passing in a modified graph.

You must be a superuser to do this.

##### PARAMS:

*  **`body`** value must be a map.


## `DELETE /api/dashboard/:dashboard-id/public_link`

Delete the publicly-accessible link to this Dashboard.

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


## `GET /api/dashboard/:id/related`

Return related entities.

##### PARAMS:

*  **`id`** 


## `GET /api/dashboard/:id/revisions`

Fetch `Revisions` for `Dashboard` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/dashboard/embeddable`

Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT.

You must be a superuser to do this.


## `GET /api/dashboard/public`

Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled.

You must be a superuser to do this.


## `POST /api/dashboard/`

Create a new `Dashboard`.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`parameters`** value must be an array. Each value must be a map.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`dashboard`** 


## `POST /api/dashboard/:dashboard-id/public_link`

Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled.

You must be a superuser to do this.

##### PARAMS:

*  **`dashboard-id`** 


## `POST /api/dashboard/:id/cards`

Add a `Card` to a `Dashboard`.

##### PARAMS:

*  **`id`** 

*  **`cardId`** value may be nil, or if non-nil, value must be an integer greater than zero.

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


## `POST /api/dashboard/save`

Save a denormalized description of dashboard.

##### PARAMS:

*  **`dashboard`** 


## `POST /api/dashboard/save/collection/:parent-collection-id`

Save a denormalized description of dashboard into collection with ID `:parent-collection-id`.

##### PARAMS:

*  **`parent-collection-id`** 

*  **`dashboard`** 


## `PUT /api/dashboard/:id`

Update a `Dashboard`.

  Usually, you just need write permissions for this Dashboard to do this (which means you have appropriate
  permissions for the Cards belonging to this Dashboard), but to change the value of `enable_embedding` you must be a
  superuser.

##### PARAMS:

*  **`parameters`** value may be nil, or if non-nil, value must be an array. Each value must be a map.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.

*  **`enable_embedding`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`dash-updates`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

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

Fetch all `Databases`. `include_tables` means we should hydrate the Tables belonging to each DB. `include_cards` here
  means we should also include virtual Table entries for saved Questions, e.g. so we can easily use them as source
  Tables in queries. Default for both is `false`.

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


## `GET /api/database/:id/schema/:schema`

Returns a list of tables for the given database `id` and `schema`

##### PARAMS:

*  **`id`** 

*  **`schema`** 


## `GET /api/database/:id/schemas`

Returns a list of all the schemas found for the database `id`

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


## `DELETE /api/email/`

Clear all email related settings. You must be a superuser to ddo this

You must be a superuser to do this.


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


## `GET /api/embed/card/:token/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Cards.

##### PARAMS:

*  **`token`** 

*  **`field-id`** 

*  **`remapped-id`** 

*  **`value`** value must be a non-blank string.


## `GET /api/embed/card/:token/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by an embedded Card.

##### PARAMS:

*  **`token`** 

*  **`field-id`** 

*  **`search-field-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.


## `GET /api/embed/card/:token/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by an embedded Card.

##### PARAMS:

*  **`token`** 

*  **`field-id`** 


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

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the `embedding-secret-key`

##### PARAMS:

*  **`token`** 

*  **`dashcard-id`** 

*  **`card-id`** 

*  **`&`** 

*  **`query-params`** 


## `GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format`

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the `embedding-secret-key`
   return the data in one of the export formats

##### PARAMS:

*  **`token`** 

*  **`export-format`** value must be one of: `csv`, `json`, `xlsx`.

*  **`dashcard-id`** 

*  **`card-id`** 

*  **`&`** 

*  **`query-params`** 


## `GET /api/embed/dashboard/:token/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Dashboards.

##### PARAMS:

*  **`token`** 

*  **`field-id`** 

*  **`remapped-id`** 

*  **`value`** value must be a non-blank string.


## `GET /api/embed/dashboard/:token/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a Card in an embedded Dashboard.

##### PARAMS:

*  **`token`** 

*  **`field-id`** 

*  **`search-field-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.


## `GET /api/embed/dashboard/:token/field/:field-id/values`

Fetch FieldValues for a Field that is used as a param in an embedded Dashboard.

##### PARAMS:

*  **`token`** 

*  **`field-id`** 


## `DELETE /api/field/:id/dimension`

Remove the dimension associated to field at ID

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id`

Get `Field` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id/related`

Return related entities.

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id/remapping/:remapped-id`

Fetch remapped Field values.

##### PARAMS:

*  **`id`** 

*  **`remapped-id`** 

*  **`value`** 


## `GET /api/field/:id/search/:search-id`

Search for values of a Field that match values of another Field when breaking out by the 

##### PARAMS:

*  **`id`** 

*  **`search-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.


## `GET /api/field/:id/summary`

Get the count and distinct count of `Field` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/field/:id/values`

If a Field's value of `has_field_values` is `list`, return a list of all the distinct values of the Field, and (if
  defined by a User) a map of human-readable remapped values.

##### PARAMS:

*  **`id`** 


## `GET /api/field/field-literal%2C:field-name%2Ctype%2F:field-type/values`

Implementation of the field values endpoint for fields in the Saved Questions 'virtual' DB. This endpoint is just a
  convenience to simplify the frontend code. It just returns the standard 'empty' field values response.

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

Update the fields values and human-readable values for a `Field` whose special type is
  `category`/`city`/`state`/`country` or whose base type is `type/Boolean`. The human-readable values are optional.

##### PARAMS:

*  **`id`** 

*  **`value-pairs`** value must be an array. Each value must be an array.


## `PUT /api/field/:id`

Update `Field` with ID.

##### PARAMS:

*  **`visibility_type`** value may be nil, or if non-nil, value must be one of: `details-only`, `hidden`, `normal`, `retired`, `sensitive`.

*  **`display_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`special_type`** value may be nil, or if non-nil, value must be a valid field type.

*  **`has_field_values`** value may be nil, or if non-nil, value must be one of: `auto-list`, `list`, `none`, `search`.

*  **`caveats`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`fk_target_field_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`id`** 


## `GET /api/geojson/:key`

Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the
  file specified for KEY).

##### PARAMS:

*  **`key`** value must be a non-blank string.


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


## `GET /api/metric/:id/related`

Return related entities.

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

Do a batch update of Permissions by passing in a modified graph. This should return the same graph, in the same
  format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever neccesary. This
  modified graph must correspond to the `PermissionsGraph` schema. If successful, this endpoint returns the updated
  permissions graph; use this as a base for any further modifications.

  Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party
  modifies it before you can submit you revisions, the endpoint will instead make no changes and return a
  409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that.

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

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 


## `GET /api/public/card/:uuid/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Cards.

##### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`remapped-id`** 

*  **`value`** value must be a non-blank string.


## `GET /api/public/card/:uuid/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a public Card.

##### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`search-field-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.


## `GET /api/public/card/:uuid/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by a public Card.

##### PARAMS:

*  **`uuid`** 

*  **`field-id`** 


## `GET /api/public/card/:uuid/query`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `GET /api/public/card/:uuid/query/:export-format`

Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
   credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 

*  **`export-format`** value must be one of: `csv`, `json`, `xlsx`.

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `GET /api/public/dashboard/:uuid`

Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled.

##### PARAMS:

*  **`uuid`** 


## `GET /api/public/dashboard/:uuid/card/:card-id`

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled.

##### PARAMS:

*  **`uuid`** 

*  **`card-id`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.


## `GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards.

##### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`remapped-id`** 

*  **`value`** value must be a non-blank string.


## `GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a Card in a public Dashboard.

##### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`search-field-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.


## `GET /api/public/dashboard/:uuid/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard.

##### PARAMS:

*  **`uuid`** 

*  **`field-id`** 


## `GET /api/public/oembed`

oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL.

##### PARAMS:

*  **`url`** value must be a non-blank string.

*  **`format`** value may be nil, or if non-nil, value must be one of: `json`.

*  **`maxheight`** value may be nil, or if non-nil, value must be a valid integer.

*  **`maxwidth`** value may be nil, or if non-nil, value must be a valid integer.


## `DELETE /api/pulse/:id`

Delete a Pulse. (DEPRECATED -- don't delete a Pulse anymore -- archive it instead.)

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/`

Fetch all Pulses

##### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/pulse/:id`

Fetch `Pulse` with ID.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/form_input`

Provides relevant configuration information and user choices for creating/updating Pulses.


## `GET /api/pulse/preview_card/:id`

Get HTML rendering of a Card with `id`.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/preview_card_info/:id`

Get JSON object containing HTML rendering of a Card with `id` and other information.

##### PARAMS:

*  **`id`** 


## `GET /api/pulse/preview_card_png/:id`

Get PNG rendering of a Card with `id`.

##### PARAMS:

*  **`id`** 


## `POST /api/pulse/`

Create a new `Pulse`.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must satisfy one of the following requirements: 1) value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name)` 2) value must be a map with the keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `POST /api/pulse/test`

Test send an unsaved pulse.

##### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must satisfy one of the following requirements: 1) value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name)` 2) value must be a map with the keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.


## `PUT /api/pulse/:id`

Update a Pulse with `id`.

##### PARAMS:

*  **`id`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`cards`** value may be nil, or if non-nil, value must be an array. Each value must satisfy one of the following requirements: 1) value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name)` 2) value must be a map with the keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.

*  **`channels`** value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`pulse-updates`** 


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


## `GET /api/search/`

Search Cards, Dashboards, Collections and Pulses for the substring `q`.

##### PARAMS:

*  **`q`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


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


## `GET /api/segment/:id/related`

Return related entities.

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


## `PUT /api/setting/`

Update multiple `Settings` values.  You must be a superuser to do this.

You must be a superuser to do this.

##### PARAMS:

*  **`settings`** 


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

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case will
  any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page).

##### PARAMS:

*  **`id`** 

*  **`include_sensitive_fields`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/table/:id/related`

Return related entities.

##### PARAMS:

*  **`id`** 


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

*  **`entity_type`** value may be nil, or if non-nil, value must be a valid entity type (keyword or string).

*  **`visibility_type`** value may be nil, or if non-nil, value must be one of: `cruft`, `hidden`, `technical`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.


## `GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/`

This endpoints provides an image with the appropriate pins rendered given a MBQL QUERY (passed as a GET query
  string param). We evaluate the query and find the set of lat/lon pairs which are relevant and then render the
  appropriate ones. It's expected that to render a full map view several calls will be made to this endpoint in
  parallel.

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

Fetch a list of `Users` for the admin People page or for Pulses. By default returns only active users. If
  `include_deactivated` is true, return all Users (active and inactive). (Using `include_deactivated` requires
  superuser permissions.)

##### PARAMS:

*  **`include_deactivated`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').


## `GET /api/user/:id`

Fetch a `User`. You must be fetching yourself *or* be a superuser.

##### PARAMS:

*  **`id`** 


## `GET /api/user/current`

Fetch the current `User`.


## `POST /api/user/`

Create a new `User`, return a 400 if the email address is already taken

You must be a superuser to do this.

##### PARAMS:

*  **`first_name`** value must be a non-blank string.

*  **`last_name`** value must be a non-blank string.

*  **`email`** value must be a valid email address.

*  **`password`** 

*  **`login_attributes`** value may be nil, or if non-nil, value must be a map with each value either a string or number.


## `POST /api/user/:id/send_invite`

Resend the user invite email for a given user.

You must be a superuser to do this.

##### PARAMS:

*  **`id`** 


## `PUT /api/user/:id`

Update an existing, active `User`.

##### PARAMS:

*  **`id`** 

*  **`email`** value may be nil, or if non-nil, value must be a valid email address.

*  **`first_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`last_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`is_superuser`** 

*  **`login_attributes`** value may be nil, or if non-nil, value must be a map with each value either a string or number.


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


## `PUT /api/user/:id/reactivate`

Reactivate user at `:id`

You must be a superuser to do this.

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
---
title: "Dashboard"
summary: |
  /api/dashboard endpoints.
---

# Dashboard

/api/dashboard endpoints.

## `DELETE /api/dashboard/:dashboard-id/public_link`

Delete the publicly-accessible link to this Dashboard.

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

## `DELETE /api/dashboard/:id`

Hard delete a Dashboard. To soft delete, use `PUT /api/dashboard/:id`

  This will remove also any questions/models/segments/metrics that use this database.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/dashboard/`

This endpoint is currently unused by the Metabase frontend and may be out of date with the rest of the application.
  It only exists for backwards compatibility and may be removed in the future.

  Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:
  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.).

### PARAMS:

-  **`f`** nullable enum of all, mine, archived.

## `GET /api/dashboard/:dashboard-id/dashcard/:dashcard-id/execute`

Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`parameters`** value must be a valid JSON string.

## `GET /api/dashboard/:id`

Get Dashboard with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/dashboard/:id/params/:param-key/search/:query`

Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`. Optionally restrict
  these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that contain 'Cam' and are possible when parameter 'def' is set
    ;; to 100
     GET /api/dashboard/1/params/abc/search/Cam?def=100

  Currently limited to first 1000 results.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`param-key`** 

-  **`query`** value must be a non-blank string.

-  **`constraint-param-key->value`**

## `GET /api/dashboard/:id/params/:param-key/values`

Fetch possible values of the parameter whose ID is `:param-key`. If the values come directly from a query, optionally
  restrict these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that are possible when parameter 'def' is set to 100
    GET /api/dashboard/1/params/abc/values?def=100.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`param-key`** 

-  **`constraint-param-key->value`**

## `GET /api/dashboard/:id/query_metadata`

Get all of the required query metadata for the cards on dashboard.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/dashboard/:id/related`

Return related entities.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/dashboard/:id/revisions`

Fetch `Revisions` for Dashboard with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/dashboard/embeddable`

Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT.

## `GET /api/dashboard/params/valid-filter-fields`

Utility endpoint for powering Dashboard UI. Given some set of `filtered` Field IDs (presumably Fields used in
  parameters) and a set of `filtering` Field IDs that will be used to restrict values of `filtered` Fields, for each
  `filtered` Field ID return the subset of `filtering` Field IDs that would actually be used in a chain filter query
  with these Fields.

  e.g. in a chain filter query like

  GET /api/dashboard/10/params/PARAM_1/values?PARAM_2=100

  Assume `PARAM_1` maps to Field 1 and `PARAM_2` maps to Fields 2 and 3. The underlying MBQL query may or may not
  filter against Fields 2 and 3, depending on whether an FK relationship that lets us create a join against Field 1
  can be found. You can use this endpoint to determine which of those Fields is actually used:

  GET /api/dashboard/params/valid-filter-fields?filtered=1&filtering=2&filtering=3
  ;; ->
  {1 [2 3]}

  Results are returned as a map of

  `filtered` Field ID -> subset of `filtering` Field IDs that would be used in chain filter query.

### PARAMS:

-  **`filtered`** vector of value must be an integer greater than zero.

-  **`filtering`** nullable vector of value must be an integer greater than zero.

## `GET /api/dashboard/public`

Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled.

## `POST /api/dashboard/`

Create a new Dashboard.

### PARAMS:

-  **`name`** value must be a non-blank string.

-  **`description`** nullable string.

-  **`parameters`** nullable sequence of parameter must be a map with :id and :type keys.

-  **`cache_ttl`** nullable value must be an integer greater than zero.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`collection_position`** nullable value must be an integer greater than zero.

-  **`_dashboard`**

## `POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query`

Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it.

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`parameters`** nullable sequence of value must be a parameter map with an id key.

## `POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format`

Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it, and return
  its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions).

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`export-format`** enum of csv, api, xlsx, json.

-  **`parameters`** nullable value must be a valid JSON string.

-  **`format_rows`** nullable boolean.

-  **`request-parameters`**

## `POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/execute`

Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values.
   `extra_parameters` should be the extra, user entered parameter values.

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`parameters`** nullable map from <string> to <anything>.

-  **`_body`**

## `POST /api/dashboard/:dashboard-id/public_link`

Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled.

You must be a superuser to do this.

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

## `POST /api/dashboard/:from-dashboard-id/copy`

Copy a Dashboard.

### PARAMS:

-  **`from-dashboard-id`** nullable value must be an integer greater than zero.

-  **`name`** nullable value must be a non-blank string.

-  **`description`** nullable string.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`collection_position`** nullable value must be an integer greater than zero.

-  **`is_deep_copy`** nullable boolean.

-  **`_dashboard`**

## `POST /api/dashboard/:id/revert`

Revert a Dashboard to a prior `Revision`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`revision_id`** value must be an integer greater than zero.

## `POST /api/dashboard/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query`

Run a pivot table query for a specific DashCard.

### PARAMS:

-  **`dashboard-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`parameters`** nullable sequence of value must be a parameter map with an id key.

## `POST /api/dashboard/save`

Save a denormalized description of dashboard.

### PARAMS:

-  **`dashboard`**

## `POST /api/dashboard/save/collection/:parent-collection-id`

Save a denormalized description of dashboard into collection with ID `:parent-collection-id`.

### PARAMS:

-  **`parent-collection-id`** value must be an integer greater than zero.

-  **`dashboard`**

## `PUT /api/dashboard/:id`

Update a Dashboard, and optionally the `dashcards` and `tabs` of a Dashboard. The request body should be a JSON object with the same
  structure as the response from `GET /api/dashboard/:id`.

### PARAMS:

-  **`parameters`** nullable sequence of parameter must be a map with :id and :type keys.

-  **`points_of_interest`** nullable string.

-  **`description`** nullable string.

-  **`archived`** nullable boolean.

-  **`dashcards`** nullable value must be seq of maps in which ids are unique.

-  **`collection_position`** nullable value must be an integer greater than zero.

-  **`tabs`** nullable value must be seq of maps in which ids are unique.

-  **`show_in_getting_started`** nullable boolean.

-  **`enable_embedding`** nullable boolean.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`dash-updates`** 

-  **`name`** nullable value must be a non-blank string.

-  **`width`** nullable enum of fixed, full.

-  **`caveats`** nullable string.

-  **`embedding_params`** nullable value must be a valid embedding params map.

-  **`cache_ttl`** nullable value must be an integer greater than zero.

-  **`id`** value must be an integer greater than zero.

-  **`position`** nullable value must be an integer greater than zero.

## `PUT /api/dashboard/:id/cards`

(DEPRECATED -- Use the `PUT /api/dashboard/:id` endpoint instead.)
   Update `Cards` and `Tabs` on a Dashboard. Request body should have the form:

    {:cards        [{:id                 ... ; DashboardCard ID
                     :size_x             ...
                     :size_y             ...
                     :row                ...
                     :col                ...
                     :parameter_mappings ...
                     :series             [{:id 123
                                           ...}]}
                     ...]
     :tabs [{:id       ... ; DashboardTab ID
                     :name     ...}]}.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`cards`** value must be seq of maps in which ids are unique.

-  **`tabs`** nullable value must be seq of maps in which ids are unique.

---

[<< Back to API index](../api-documentation.md)
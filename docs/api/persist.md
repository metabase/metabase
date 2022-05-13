# Persist

  - [GET /api/persist/](#get-apipersist)
  - [GET /api/persist/:persisted-info-id](#get-apipersistpersisted-info-id)
  - [GET /api/persist/card/:card-id](#get-apipersistcardcard-id)
  - [POST /api/persist/disable](#post-apipersistdisable)
  - [POST /api/persist/enable](#post-apipersistenable)
  - [POST /api/persist/set-interval](#post-apipersistset-interval)

## `GET /api/persist/`

List the entries of [[PersistedInfo]] in order to show a status page.

You must be a superuser to do this.

## `GET /api/persist/:persisted-info-id`

Fetch a particular [[PersistedInfo]] by id.

You must be a superuser to do this.

### PARAMS:

*  **`persisted-info-id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `GET /api/persist/card/:card-id`

Fetch a particular [[PersistedInfo]] by card-id.

You must be a superuser to do this.

### PARAMS:

*  **`card-id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `POST /api/persist/disable`

Disable global setting to allow databases to persist models. This will remove all tasks to refresh tables, remove
  that option from databases which might have it enabled, and delete all cached tables.

You must be a superuser to do this.

## `POST /api/persist/enable`

Enable global setting to allow databases to persist models.

You must be a superuser to do this.

## `POST /api/persist/set-interval`

Set the interval (in hours) to refresh persisted models. Shape should be JSON like {hours: 4}.

You must be a superuser to do this.

### PARAMS:

*  **`hours`** Value must be an integer representing hours greater than or equal to one and less than or equal to twenty-four

*  **`_body`**

---

[<< Back to API index](../api-documentation.md)
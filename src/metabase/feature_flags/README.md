# Metabase Feature Flags

This module provides feature flag functionality using the [Unleash](https://www.getunleash.io/) feature flag service.

## Configuration

The Unleash client can be configured using the following environment variables:

- `MB_UNLEASH_URL` - The URL to the Unleash API (default: `http://localhost:4242/api/`)
- `MB_UNLEASH_API_KEY` - The API key for Unleash authentication (default: `default:development.unleash-insecure-api-token`)
- `MB_UNLEASH_APP_NAME` - The application name to use (default: `metabase`)
- `MB_UNLEASH_INSTANCE_ID` - The instance ID to use (default: `metabase-{process-uuid}`)

## Using Feature Flags

To check if a feature is enabled in your code:

```clojure
(require '[metabase.feature-flags.unleash :as feature-flags])

;; Check if the db-routing feature is enabled
(when (feature-flags/db-routing-enabled?)
  ;; Do something when db-routing is enabled
  )

;; Check any feature flag
(when (feature-flags/feature-enabled? "some-feature")
  ;; Do something when some-feature is enabled
  )

;; With context and default value
(when (feature-flags/feature-enabled? "some-feature" {:user-id "123"} false)
  ;; Do something when some-feature is enabled
  )
```

## Enterprise Features

Some features are Enterprise Edition only. For these features, the feature flag acts as an additional control on top of the EE license requirement. This means:

1. The feature requires a valid Enterprise Edition license
2. The feature can be toggled on/off using the feature flag

### Database Routing

The `db-routing` feature flag controls the Enterprise Edition Database Routing functionality. When enabled:

- Database routing middleware will be active
- Mirror databases will be used according to user attributes
- Safety checks will be enforced

When disabled:
- Database routing will be bypassed, even in Enterprise Edition
- All database queries will go directly to the original database

## Setting Up Unleash Server

To use feature flags, you'll need an Unleash server. For local development:

1. Run Unleash using Docker:
   ```bash
   docker run -p 4242:4242 unleashorg/unleash-server
   ```

2. Open http://localhost:4242 in your browser
   - Username: `admin`
   - Password: `unleash4all`

3. Create a new feature flag called `db-routing`

4. Enable or disable the feature as needed

## Testing

To test feature flags without an Unleash server, you can use the demo:

```clojure
(require 'metabase.feature-flags.unleash-demo)
(metabase.feature-flags.unleash-demo/run-demo)
``` 
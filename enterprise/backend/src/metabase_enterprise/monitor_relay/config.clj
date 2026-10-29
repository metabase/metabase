(ns metabase-enterprise.monitor-relay.config
  "Where the relay sends: the URL in [[relay.settings/metabase-monitor-url]], which the relay reads each cycle.
  `MB_METABASE_MONITOR_URL` wins over the value an admin saves.

  The token is the instance's only credential: never log it, or the URL that holds it."
  (:require
   [metabase-enterprise.monitor-relay.settings :as relay.settings]))

(set! *warn-on-reflection* true)

(defn target
  "Where the relay sends now, as `{:status ...}`:

  - `:ok`, with the URL's `:base` and `:token`;
  - `:unset`, when no URL is set;
  - `:malformed`, when the URL is not of the form `<base>/ingest/<token>`. Only `MB_METABASE_MONITOR_URL` can hold
    such a URL: the setting refuses one."
  []
  (if-let [url (relay.settings/metabase-monitor-url)]
    (if-let [parsed (relay.settings/parse-url url)]
      (assoc parsed :status :ok)
      {:status :malformed})
    {:status :unset}))

(ns metabase.embeddings.startup
  "Startup-time registration of the in-process embedding provider.

  The provider registers itself while its plugin initializes, so every entry point that might embed has to run
  this. The server does it during init; standalone modes that skip init have to do it themselves, or embedding
  fails with `:provider-not-registered`."
  (:require
   [metabase.plugins.core :as plugins]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def embedder-plugin-name
  "Manifest `info.name` of the in-process embedder.
  Pinned against the manifest by `metabase.embeddings.embedder-plugin-name-test`; a rename here without
  one there silently disables the plugin, since `plugins/registered?` looks it up by this exact string."
  "Metabase In-Process Embedder")

(defn ensure-in-process-provider!
  "Register the in-process embedding provider when its plugin is installed.

  Plugin loading is idempotent, so callers that have already loaded plugins pay nothing extra. Initialization only
  registers the provider: DJL and the model itself stay lazy, so a server that never embeds loads neither. The
  plugin ships separately from the uberjar, so its absence is the normal case and is not worth a warning."
  []
  (plugins/load-plugins!)
  (when (plugins/registered? embedder-plugin-name)
    (try
      (plugins/load-plugin! embedder-plugin-name)
      (catch Exception e
        (log/warnf "Unable to activate the in-process embedder plugin: %s" (ex-message e))))))

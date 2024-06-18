(ns metabase.lib.database.methods
  "Wrappers around [[metabase.driver]] methods that we may need to use inside MLv2 such
  as [[metabase.driver/escape-alias]], so we can decouple the driver interface from MLv2. Since driver methods are
  Clojure-only, we should only expect these to be bound in Clojure-land usage (e.g. the QP) and not in Cljs usage.
  MetadataProviders can pass these methods in as part of the database under the `:lib/methods` key. See the
  `:metabase.lib.schema.metadata/database.methods` schema for more info."
  (:require
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn escape-alias :- :string
  "MLv2-friendly wrapper around [[metabase.driver/escape-alias]]. By default this is `identity` but metadata providers
  can override this by including `[:lib/methods :escape-alias]` as part of the Database metadata.

  This is used for escaping a unique alias when generating `:lib/desired-alias`."
  ^String [database :- [:maybe ::lib.schema.metadata/database]
           s        :- :string]
  (let [f (get-in database [:lib/methods :escape-alias] identity)]
    (f s)))

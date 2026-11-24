(ns metabase.api.macros.defendpoint.closed-schemas
  "Check, when a `defendpoint` is evaluated, that its request schemas let nothing through that
  [[metabase.api.macros/decode-transformer]] does not strip, which are the schemas that accept a map with a key of ours
  as it arrived, a `:map-of` keyed by keywords, and any other finding of [[metabase.util.malli.closed-schemas]], where a
  `[:map {:closed false}]` opts out and `metabase.api-routes.closed-schemas-test` pins every one a request can reach."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.closed-schemas :as mu.closed-schemas]))

(set! *warn-on-reflection* true)

(defn- strips-internal-keys?
  "Whether the API decoder removes internal keys from this map before validation."
  [schema]
  (contains? #{#'lib.schema.common/remove-internal-keys lib.schema.common/remove-internal-keys}
             (:decode/api (mc/properties schema))))

(defn- stripped-internal-key? [map-schema k]
  (and (strips-internal-keys? map-schema)
       (lib.schema.common/internal-key? k)))

(def ^:private options
  {:any-schema? mu.closed-schemas/passes-as-arrived?
   :open-key?   mu.closed-schemas/accepts-keyword?
   :cache-key   ::passes-as-arrived
   :guards?     true
   :skip-entry? stripped-internal-key?})

(defn findings
  "Everything reachable from `schema` that the API decoder does not strip, each with its `:kind`, `:trail` and `:form`."
  [schema]
  (mu.closed-schemas/findings schema options))

(defn check!
  "Throw when `schema`, the `schema-type` (`:route`, `:query`, `:body` or `:request`) schema of an endpoint, can reach
  a schema that lets a value of any shape or a map of any keyword keys through; does nothing for a `:response` schema."
  [schema-type schema]
  (when (and mu.closed-schemas/*enabled* (not= schema-type :response))
    (when-let [found (mu.closed-schemas/failing-findings schema options)]
      (throw (ex-info (format (str "The %s schema of this endpoint reaches schemas the API does not strip, so a client"
                                   " can send data no schema describes. Give :any a type and key a map-of by"
                                   " :string:\n%s")
                              (name schema-type)
                              (mu.closed-schemas/describe-findings found))
                      {:schema-type schema-type, :schema schema, :findings found})))))

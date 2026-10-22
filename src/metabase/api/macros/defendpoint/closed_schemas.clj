(ns metabase.api.macros.defendpoint.closed-schemas
  "Check, when a `defendpoint` is evaluated, that every schema it can reach from a request declares its shape.

  A `[:map ...]` that is not `{:closed true}` accepts any key and, once [[metabase.api.macros/decode-transformer]] has
  stripped the request, silently discards the ones it does not declare -- so an endpoint reading a key it never
  declared just sees `nil`. Closing every map an endpoint can reach turns that class of bug into a schema error. Two
  other shapes are the same escape hatch wearing a different hat and are reported too: a `:map-of` keyed by
  `:keyword` (or anything as loose), and `:any`, which lets a value of any shape through unexamined.

  What is accepted is described in [[metabase.util.malli.closed-schemas]]; in addition, the entries of a map whose
  `:decode/api` is [[metabase.lib.schema.common/remove-internal-keys]] that are internal keys are skipped: the API
  decoder removes them from every request, so what they hold never arrives from a client.

  Registry schemas are walked once per JVM: a key already visited by an earlier endpoint is not walked again, so the
  first endpoint to reach an offending registry schema is the one that fails on it."
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

(def ^:private visited-registry-keys
  "Registry keys some endpoint has already walked, so each is walked once per JVM."
  (atom #{}))

(defn findings
  "Every open map, keyword-keyed `:map-of` and `:any` reachable from `schema`, each with the `:trail` of map keys and
  registry keys that leads to it from the root. Registry keys in `visited` are skipped and added to as they are
  walked."
  ([schema]
   (findings schema (atom #{})))
  ([schema visited]
   (mu.closed-schemas/findings schema {:visited visited, :skip-entry? stripped-internal-key?})))

(defn check!
  "Throw when `schema`, the `schema-type` (`:route`, `:query`, `:body` or `:request`) schema of an endpoint, can reach
  a schema that does not declare its shape. Only request schemas are checked: stripping is what makes an open map a
  problem, and only a request is stripped; a `:response` schema is left alone. Impl for
  [[metabase.api.macros/validate-schema]]."
  [schema-type schema]
  (when (and mu.closed-schemas/*enabled* (not= schema-type :response))
    (when-let [found (not-empty (findings schema visited-registry-keys))]
      (throw (ex-info (format (str "The %s schema of this endpoint reaches schemas that do not declare their shape."
                                   " Close every map with {:closed true}, key a map-of by :string, and give :any a"
                                   " type; a value whose keys or type really are not ours to know is one of the"
                                   " deliberately open schemas in metabase.util.malli.schema:\n%s")
                              (name schema-type)
                              (mu.closed-schemas/describe-findings found))
                      {:schema-type schema-type, :schema schema, :findings found})))))

(ns metabase.api.macros.defendpoint.closed-schemas
  "Check, when a `defendpoint` is evaluated, that every schema it can reach from a request declares its shape.

  A `[:map ...]` that is not `{:closed true}` accepts any key and, once [[metabase.api.macros/decode-transformer]] has
  stripped the request, silently discards the ones it does not declare -- so an endpoint reading a key it never
  declared just sees `nil`. Closing every map an endpoint can reach turns that class of bug into a schema error. Two
  other shapes are the same escape hatch wearing a different hat and are reported too: a `:map-of` keyed by
  `:keyword` (or anything as loose), and `:any`, which lets a value of any shape through unexamined.

  What is accepted instead:

  - a map with a `::mc/default` entry, which says what the other keys are, as long as that schema passes too;
  - `:any` as a conjunct of an `:and` (or inside a normalization carrier that is one), where the other conjuncts
    constrain the value and the `:any` only carries a decoder;
  - the entries of a map whose `:decode/api` is [[metabase.lib.schema.common/remove-internal-keys]] that are internal
    keys: the API decoder removes them from every request, so what they hold never arrives from a client;
  - the schemas marked `::mr/deliberately-open`: the deliberately open maps in [[metabase.util.malli.schema]] and the
    `cljc` twin of one of them, `:metabase.lib.schema.common/visualization-settings`, for values whose keys belong to
    a driver, the frontend or a settings registry. Nothing else should carry that marker.

  Registry schemas are walked once per JVM: a key already visited by an earlier endpoint is not walked again, so the
  first endpoint to reach an offending registry schema is the one that fails on it."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:dynamic *enabled*
  "Whether [[check!]] does anything. On outside prod, where the walk is a startup cost with nothing left to find."
  (not config/is-prod?))

(defn- ref-name
  "The registry key a schema refers to, for `[:ref ::foo]` and for a bare `::foo` reference alike."
  [schema]
  (if (= (mc/type schema) :ref)
    (let [child (first (mc/children schema))]
      (when (qualified-keyword? child) child))
    (when (mc/-ref-schema? schema)
      (let [form (mc/form schema)]
        (when (qualified-keyword? form) form)))))

(defn- deref-safe [schema]
  (let [dereffed (try (mc/deref schema) (catch Throwable _ nil))]
    (when-not (identical? dereffed schema)
      dereffed)))

(def ^:private open-map-of-key-schemas
  "`:map-of` key schemas that make the map an open bag of arbitrary keys."
  #{:keyword 'keyword? :any :some 'any?})

(def ^:private any-schemas
  #{:any 'any?})

(defn- deliberately-open? [schema]
  (true? (::mr/deliberately-open (mc/properties schema))))

(defn- default-entry? [child]
  (and (vector? child) (= (first child) ::mc/default)))

(defn- strips-internal-keys?
  "Whether the API decoder removes internal keys from this map before validation."
  [schema]
  (contains? #{#'lib.schema.common/remove-internal-keys lib.schema.common/remove-internal-keys}
             (:decode/api (mc/properties schema))))

(defn- finding [schema trail kind]
  {:trail trail, :kind kind, :form (mc/form schema)})

(defn- walk-schema!
  "Walk `schema`, adding to `findings`. `conjunct?` is true while inside a conjunct of an `:and`, where an `:any` is a
  carrier rather than a hole; it turns false again on entering a map entry or a `:map-of` value, which are holes."
  [schema trail visited findings conjunct?]
  (when-let [schema (try (mc/schema schema) (catch Throwable _ nil))]
    (let [schema-type  (mc/type schema)
          registry-key (ref-name schema)]
      (cond
        registry-key
        (when-not (contains? @visited registry-key)
          (swap! visited conj registry-key)
          (when-let [dereffed (deref-safe schema)]
            (walk-schema! dereffed (conj trail registry-key) visited findings conjunct?)))

        (deliberately-open? schema)
        nil

        :else
        (do
          (cond
            (and (= schema-type :map)
                 (not (true? (:closed (mc/properties schema))))
                 (not (some default-entry? (mc/children schema))))
            (swap! findings conj (finding schema trail :open-map))

            (and (= schema-type :map-of) (contains? open-map-of-key-schemas (mc/form (first (mc/children schema)))))
            (swap! findings conj (finding schema trail :keyword-keyed-map-of))

            (and (contains? any-schemas schema-type) (not conjunct?))
            (swap! findings conj (finding schema trail :any)))
          (if (mc/-ref-schema? schema)
            (when-let [dereffed (deref-safe schema)]
              (walk-schema! dereffed trail visited findings conjunct?))
            (let [conjunct? (or (= schema-type :and) conjunct?)
                  skip-key? (if (and (= schema-type :map) (strips-internal-keys? schema))
                              lib.schema.common/internal-key?
                              (constantly false))]
              (doseq [[i child] (map-indexed vector (mc/children schema))]
                (cond
                  (and (vector? child) (= 3 (count child)) (mc/schema? (nth child 2)))
                  (when-not (skip-key? (first child))
                    (walk-schema! (nth child 2) (conj trail (first child)) visited findings
                                  (if (= schema-type :map)
                                    (and conjunct? (default-entry? child))
                                    conjunct?)))

                  (= schema-type :map-of)
                  (walk-schema! child (conj trail i) visited findings (and conjunct? (zero? i)))

                  (or (mc/schema? child) (vector? child) (qualified-keyword? child))
                  (walk-schema! child (conj trail i) visited findings conjunct?))))))))))

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
   (let [found (atom [])]
     (walk-schema! schema [] visited found false)
     @found)))

(defn- describe-finding [{:keys [trail kind form]}]
  (format "  %s at %s: %s"
          (case kind
            :open-map             "open map"
            :keyword-keyed-map-of "keyword-keyed map-of"
            :any                  ":any")
          (if (seq trail) (pr-str trail) "the root")
          (u/pprint-to-str form)))

(defn check!
  "Throw when `schema`, the `schema-type` (`:route`, `:query`, `:body` or `:request`) schema of an endpoint, can reach
  a schema that does not declare its shape. Only request schemas are checked: stripping is what makes an open map a
  problem, and only a request is stripped; a `:response` schema is left alone. Impl for
  [[metabase.api.macros/validate-schema]]."
  [schema-type schema]
  (when (and *enabled* (not= schema-type :response))
    (when-let [found (not-empty (findings schema visited-registry-keys))]
      (throw (ex-info (format (str "The %s schema of this endpoint reaches schemas that do not declare their shape."
                                   " Close every map with {:closed true}, key a map-of by :string, and give :any a"
                                   " type; a value whose keys or type really are not ours to know is one of the"
                                   " deliberately open schemas in metabase.util.malli.schema:\n%s")
                              (name schema-type)
                              (str/join "\n" (map describe-finding found)))
                      {:schema-type schema-type, :schema schema, :findings found})))))

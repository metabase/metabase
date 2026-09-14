(ns metabase.util.malli.closed-schemas
  "Find the schemas reachable from a schema that do not declare their shape: open maps, keyword-keyed `:map-of`s and
  `:any`.

  Accepted instead: a map with a `::mc/default` entry (whose schema is walked), `:any` as a conjunct of an `:and`,
  and the schemas marked `::mr/deliberately-open`. Registry schemas are walked once per `visited` set, except the ones of a
  library."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.config.core :as config]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:dynamic *enabled*
  "Whether the checks in this namespace do anything; off in prod."
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
  #{:keyword 'keyword? :any :some 'any? 'some?})

(def ^:private open-map-schemas
  "Predicate schemas that accept a map with any keys."
  #{'map?})

(def ^:private any-schemas
  "Schemas that let a value of any shape through."
  #{:any 'any? :some 'some?})

(def ^:private value-schemas
  "Schemas whose children are values, not schemas, and are not walked."
  #{:= :not= :enum :fn :re})

(defn- external-registry-key?
  "Whether `registry-key` belongs to a namespace outside Metabase, such as a library's schemas."
  [registry-key]
  (let [ns-name (namespace registry-key)]
    (and (not (str/starts-with? ns-name "metabase"))
         (some? (find-ns (symbol ns-name))))))

(defn- deliberately-open? [schema]
  (true? (::mr/deliberately-open (mc/properties schema))))

(defn- default-entry? [child]
  (and (vector? child) (= (first child) ::mc/default)))

(defn- finding [schema trail kind]
  {:trail trail, :kind kind, :form (mc/form schema)})

(defn- walk-schema!
  "Walk `schema`, adding to `findings`; `conjunct?` is true inside a conjunct of an `:and`, where `:any` is allowed."
  [schema trail {:keys [visited findings any? skip-entry?], :as options} conjunct?]
  (when-let [schema (try (mc/schema schema) (catch Throwable _ nil))]
    (let [schema-type  (mc/type schema)
          registry-key (ref-name schema)]
      (cond
        registry-key
        (when-not (or (contains? @visited registry-key)
                      (external-registry-key? registry-key))
          (swap! visited conj registry-key)
          (when-let [dereffed (deref-safe schema)]
            (walk-schema! dereffed (conj trail registry-key) options conjunct?)))

        (deliberately-open? schema)
        nil

        :else
        (do
          (cond
            (or (and (= schema-type :map)
                     (not (true? (:closed (mc/properties schema))))
                     (not (some default-entry? (mc/children schema))))
                (contains? open-map-schemas schema-type))
            (swap! findings conj (finding schema trail :open-map))

            (and (= schema-type :map-of)
                 (let [key-schema (first (mc/children schema))]
                   (or (contains? open-map-of-key-schemas (mc/form key-schema))
                       (contains? open-map-of-key-schemas (mc/type key-schema)))))
            (swap! findings conj (finding schema trail :keyword-keyed-map-of))

            (and any? (contains? any-schemas schema-type) (not conjunct?))
            (swap! findings conj (finding schema trail :any)))
          (cond
            (mc/-ref-schema? schema)
            (when-let [dereffed (deref-safe schema)]
              (walk-schema! dereffed trail options conjunct?))

            (contains? value-schemas schema-type)
            nil

            :else
            (let [conjunct? (case schema-type
                              :and                                          true
                              (:schema :multi)                              conjunct?
                              (:sequential :vector :set :tuple :maybe :or)  false
                              conjunct?)]
              (doseq [[i child] (map-indexed vector (mc/children schema))]
                (cond
                  (and (vector? child) (= 3 (count child)) (mc/schema? (nth child 2)))
                  (when-not (and (= schema-type :map)
                                 (not (default-entry? child))
                                 (skip-entry? schema (first child)))
                    (walk-schema! (nth child 2) (conj trail (first child)) options
                                  (if (= schema-type :map)
                                    (and conjunct? (default-entry? child))
                                    conjunct?)))

                  (= schema-type :map-of)
                  (walk-schema! child (conj trail i) options (and conjunct? (zero? i)))

                  (or (mc/schema? child) (vector? child) (qualified-keyword? child))
                  (walk-schema! child (conj trail i) options conjunct?))))))))))

(defn findings
  "Every open map, keyword-keyed `:map-of` and, when `:any?`, `:any` reachable from `schema`, each with the `:trail`
  of keys leading to it.

  Options: `:visited`, an atom of registry keys to skip and add to; `:any?`, default true; `:skip-entry?`, a
  `(fn [map-schema k])` for map entries not to walk."
  ([schema]
   (findings schema {}))
  ([schema {:keys [visited any? skip-entry?], :or {any? true, skip-entry? (constantly false)}}]
   (let [found (atom [])]
     (walk-schema! schema [] {:visited     (or visited (atom #{}))
                              :findings    found
                              :any?        any?
                              :skip-entry? skip-entry?}
                   false)
     @found)))

(defn describe-findings
  "A line per finding, for an error message."
  [found]
  (str/join "\n" (for [{:keys [trail kind form]} found]
                   (format "  %s at %s: %s"
                           (case kind
                             :open-map             "open map"
                             :keyword-keyed-map-of "keyword-keyed map-of"
                             :any                  ":any")
                           (if (seq trail) (pr-str trail) "the root")
                           (pr-str form)))))

(def ^:private visited-arg-registry-keys
  "Registry keys [[check-args!]] has already walked."
  (atom #{}))

(defn check-args!
  "Throw when an argument schema of `fn-name` can reach an open map or a keyword-keyed `:map-of`."
  [fn-name arg-schemas]
  (when *enabled*
    (when-let [found (not-empty (into []
                                      (mapcat #(findings % {:visited visited-arg-registry-keys, :any? false}))
                                      arg-schemas))]
      (throw (ex-info (format (str "The arguments of %s reach maps that are not closed. Close every map with"
                                   " {:closed true} and key a map-of by :string:\n%s")
                              fn-name
                              (describe-findings found))
                      {:fn-name fn-name, :findings found})))))

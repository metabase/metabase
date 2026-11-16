(ns metabase.api.macros.defendpoint.request-schemas
  "Check, when a `defendpoint` is evaluated, that its request schemas let nothing through that
  [[metabase.api.macros/decode-transformer]] does not strip.

  The decoder drops the keys a `[:map ...]` does not declare and the entries of a `:map-of` that fail its key or value
  schema, and touches nothing else. So these let a client send data no schema describes, and are reported:

  - `:any`: a schema that accepts a map with a key of ours, or a sequence of such maps, as it arrived: `:any`,
    `:some`, `map?`, `[:fn map?]` and so on. A `:fn` is never stripped; one that rejects both probes is not reported, whatever else it
    accepts.
  - `:keyword-keyed-map-of`: a `:map-of` whose key schema accepts a keyword.
  - `:open-map`: a `[:map {:closed false} ...]`, which opts out of stripping.

  A `::mc/default` entry stops a map from being stripped and hands the other keys to its schema, which is walked like
  any other. Every conjunct of an `:and` decodes the value, so one conjunct that types or strips it is enough; a `:fn`
  conjunct is a guard and decides nothing. An alternative of an `:or` or a `:multi` is reported like the schema itself.

  A conjunct that lets nothing through declares the whole value, so only the open maps of its siblings are reported.

  [[check!]] throws on `:any` and `:keyword-keyed-map-of`. An `:open-map` is allowed, and
  `metabase.api-routes.request-schemas-test` pins every one a request can reach.

  The entries of a map whose `:decode/api` is [[metabase.lib.schema.common/remove-internal-keys]] that are internal
  keys are skipped: the API decoder removes them from every request."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private value-probes
  "Values no typed schema accepts: a map with a key of ours, and a sequence of such maps."
  [{::probe 1} [{::probe 1}]])

(def ^:private key-probes
  "Keywords no schema declares."
  [::probe :probe])

(defn- accepts-some? [schema probes]
  (boolean (some #(try (mr/validate schema %) (catch Throwable _ false)) probes)))

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

(defn- strips-internal-keys?
  "Whether the API decoder removes internal keys from this map before validation."
  [schema]
  (contains? #{#'lib.schema.common/remove-internal-keys lib.schema.common/remove-internal-keys}
             (:decode/api (mc/properties schema))))

(defn- default-entry? [[k]]
  (= k ::mc/default))

(defn- finding [schema trail kind]
  {:trail trail, :kind kind, :form (mc/form schema)})

(defn- unstripped
  "Everything a result lets through, at its own level or below."
  [{:keys [passes nested]}]
  (concat passes nested))

(defn- under
  "A result walked at the root, moved under `trail`."
  [result trail]
  (letfn [(move [found] (mapv #(update % :trail (partial into trail)) found))]
    (-> result (update :passes move) (update :nested move))))

(def ^:private alternative-schemas
  "Schemas that accept what any one of their children accepts."
  #{:or :orn :maybe :multi :schema})

(def ^:private collection-schemas
  "Schemas whose children describe the elements of a sequence."
  #{:sequential :vector :set :tuple :cat :catn :alt :altn :? :* :+ :repeat})

(defn- child-schemas
  "The `[trail-key schema]` pairs of the children of `schema`, entries and plain children alike."
  [schema]
  (keep-indexed (fn [i child]
                  (cond
                    (and (vector? child) (= 3 (count child)) (mc/schema? (nth child 2)))
                    [(first child) (nth child 2)]

                    (mc/schema? child)
                    [i child]))
                (mc/children schema)))

(declare walk)

(defn- walk-registry-key
  "The result of the schema registered as `registry-key`, cached until a schema is redefined unless a cycle cut it
  short."
  [schema registry-key trail {:keys [in-progress cycles], :as state}]
  (if (contains? @in-progress registry-key)
    (do (vswap! cycles conj registry-key)
        {:typed? true})
    (letfn [(walk-it []
              (vswap! in-progress conj registry-key)
              (let [result (if-let [dereffed (deref-safe schema)]
                             (walk dereffed [] state)
                             {:typed? true})]
                (vswap! in-progress disj registry-key)
                (vswap! cycles disj registry-key)
                result))]
      (-> (if (mr/registered-schema registry-key)
            (let [cached (mr/cached ::result registry-key #(volatile! nil))]
              (or @cached
                  (let [result (walk-it)]
                    (when (empty? @cycles)
                      (vreset! cached result))
                    result)))
            (walk-it))
          (under (conj trail registry-key))))))

(defn- walk-map [schema trail state]
  (let [children (mc/children schema)
        skip?    (if (strips-internal-keys? schema) lib.schema.common/internal-key? (constantly false))
        nested   (into []
                       (comp (remove default-entry?)
                             (remove (comp skip? first))
                             (mapcat (fn [[k _ child]] (unstripped (walk child (conj trail k) state)))))
                       children)
        default  (some (fn [[_ _ child :as entry]]
                         (when (default-entry? entry)
                           (walk child (conj trail ::mc/default) state)))
                       children)
        passes   (into (if (false? (:closed (mc/properties schema)))
                         [(finding schema trail :open-map)]
                         [])
                       (:passes default))]
    {:passes passes
     :typed? (empty? passes)
     :nested (into nested (:nested default))}))

(defn- walk-map-of [schema trail state]
  (let [[key-schema value-schema] (mc/children schema)
        open?                     (accepts-some? key-schema key-probes)]
    {:passes (when open? [(finding schema trail :keyword-keyed-map-of)])
     :typed? (not open?)
     :nested (vec (unstripped (walk value-schema (conj trail 1) state)))}))

(defn- failing [found]
  (remove #(= (:kind %) :open-map) found))

(defn- walk-and
  "An `:and` lets through what all its conjuncts do, so one conjunct that declares the whole value settles it."
  [schema trail state]
  (let [results (for [[k child] (child-schemas schema)]
                  (walk child (conj trail k) state))
        decides (or (seq (remove :guard? results)) results)
        typed?  (boolean (some :typed? decides))
        passes  (when-not typed? (mapcat :passes decides))
        nested  (mapcat :nested results)
        keep    (if (some #(and (not (:guard? %)) (empty? (failing (unstripped %)))) decides)
                  (partial filter #(= (:kind %) :open-map))
                  identity)]
    {:passes (vec (keep passes))
     :typed? typed?
     :guard? (every? :guard? results)
     :nested (vec (keep nested))}))

(defn- walk-leaf [schema trail]
  (let [guard? (= (mc/type schema) :fn)]
    (cond
      (accepts-some? schema value-probes) {:passes [(finding schema trail :any)], :guard? guard?}
      guard?                              {:guard? true}
      :else                               {:typed? true})))

(defn- walk
  "What `schema` lets through: `:passes` at its own level and `:nested` below it, with `:typed?` when it lets nothing
  through at its own level and `:guard?` when it is a `:fn`, which neither types nor strips."
  [schema trail state]
  (if-let [schema (try (mc/schema schema) (catch Throwable _ nil))]
    (let [schema-type  (mc/type schema)
          registry-key (ref-name schema)]
      (cond
        registry-key
        (walk-registry-key schema registry-key trail state)

        (mc/-ref-schema? schema)
        (if-let [dereffed (deref-safe schema)]
          (walk dereffed trail state)
          {:typed? true})

        (= schema-type :map)
        (walk-map schema trail state)

        (= schema-type :map-of)
        (walk-map-of schema trail state)

        (= schema-type :and)
        (walk-and schema trail state)

        (contains? alternative-schemas schema-type)
        (let [results (for [[k child] (child-schemas schema)]
                        (walk child (conj trail k) state))
              passes  (vec (mapcat :passes results))]
          {:passes passes
           :typed? (and (empty? passes) (boolean (some :typed? results)))
           :guard? (and (seq results) (every? :guard? results))
           :nested (vec (mapcat :nested results))})

        (contains? collection-schemas schema-type)
        {:typed? true
         :nested (vec (mapcat (fn [[k child]] (unstripped (walk child (conj trail k) state)))
                              (child-schemas schema)))}

        :else
        (walk-leaf schema trail)))
    {:typed? true}))

(defn findings
  "Everything reachable from `schema` that the API decoder does not strip, each a map of `:kind` (`:any`,
  `:keyword-keyed-map-of` or `:open-map`), the `:trail` of map keys, child indexes and registry keys that leads to it
  from the root, and its `:form`."
  [schema]
  (vec (unstripped (walk schema [] {:in-progress (volatile! #{}), :cycles (volatile! #{})}))))

(defn- describe-findings [found]
  (str/join "\n" (for [{:keys [trail kind form]} found]
                   (format "  %s at %s: %s"
                           (case kind
                             :any                  "passes as it arrived"
                             :keyword-keyed-map-of "keyword-keyed map-of")
                           (if (seq trail) (pr-str trail) "the root")
                           (pr-str form)))))

(defn check!
  "Throw when `schema`, the `schema-type` (`:route`, `:query`, `:body` or `:request`) schema of an endpoint, can reach
  a schema that lets a value of any shape or a map of any keyword keys through; does nothing for a `:response` schema
  or in prod."
  [schema-type schema]
  (when-not (or config/is-prod? (= schema-type :response))
    (when-let [found (seq (failing (findings schema)))]
      (throw (ex-info (format (str "The %s schema of this endpoint reaches schemas the API does not strip, so a client"
                                   " can send them data no schema describes. Give :any a type and key a map-of by"
                                   " :string:\n%s")
                              (name schema-type)
                              (describe-findings found))
                      {:schema-type schema-type, :schema schema, :findings found})))))

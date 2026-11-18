(ns metabase.util.malli.closed-schemas
  "Find the schemas reachable from a schema that let a value through undeclared, each as an `:any` schema that accepts a
  value of any shape, a `:keyword-keyed-map-of` whose key schema accepts a keyword (for an API request only), or an
  `:open-map`, a `[:map {:closed false} ...]` that is allowed and only reported, walking a `::mc/default` entry like any
  other schema and, in an `:and`, settling the value by any conjunct that lets nothing through, which for an API request
  is never a `:fn` guard."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *enabled*
  "Whether the checks in this namespace do anything; off in prod."
  (not config/is-prod?))

(def ^:private value-probes
  "Values no typed schema accepts: a map with a key of ours, and a sequence of such maps."
  [{::probe 1} [{::probe 1}]])

(def ^:private key-probes
  "Keywords no schema declares."
  [::probe :probe])

(defn- accepts-some? [schema probes]
  (boolean (some #(try (mr/validate schema %) (catch Throwable _ false)) probes)))

(defn passes-as-arrived?
  "Whether `schema` accepts a map with a key of ours, or a sequence of such maps, as it arrived."
  [schema]
  (accepts-some? schema value-probes))

(defn accepts-keyword?
  "Whether `key-schema` accepts a keyword no schema declares."
  [key-schema]
  (accepts-some? key-schema key-probes))

(defn- external-registry-key?
  "Whether `registry-key` belongs to a namespace outside Metabase, such as the schemas of a library."
  [registry-key]
  (let [ns-name (namespace registry-key)]
    (and (not (str/starts-with? ns-name "metabase"))
         (some? (find-ns (symbol ns-name))))))

(defn- any-schema?
  "Whether `schema` is one of the schemas that accept everything."
  [schema]
  (contains? #{:any 'any? :some 'some?} (mc/type schema)))

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

(defn- default-entry? [[k]]
  (= k ::mc/default))

(defn- finding [schema trail kind]
  {:trail trail, :kind kind, :form (mc/form schema)})

(defn- unstripped
  "Everything a result lets through, at its own level or below."
  [{:keys [passes nested]}]
  (concat passes nested))

(defn- schema-trail
  "The part of `trail` from the last registry key on, which names the schema a finding is in."
  [trail]
  (let [i (last (keep-indexed (fn [i k] (when (and (qualified-keyword? k) (not= k ::mc/default)) i)) trail))]
    (cond-> trail i (subvec i))))

(defn- one-per-schema
  "The `found` findings with one trail kept for each schema they are in, so a result does not grow with every path."
  [found]
  (into [] (m/distinct-by (juxt :kind (comp schema-trail :trail))) found))

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

(defn failing
  "The `found` findings a check throws on: every one that is not an open map."
  [found]
  (remove #(= (:kind %) :open-map) found))

(declare walk)

(def ^:private results
  "The result of each registry key walked so far, per leaf rule, for one state of the registry."
  (atom {}))

(defn- registry-state
  "An object that is replaced whenever a schema is registered."
  []
  (mr/cached ::registry-state ::registry-state #(Object.)))

(defn- cached-result [cache-key registry-key]
  (let [{:keys [state by-key]} @results]
    (when (identical? state (registry-state))
      (get by-key [cache-key registry-key]))))

(defn- cache-result! [cache-key registry-key result]
  (let [state (registry-state)]
    (swap! results (fn [{current :state, :keys [by-key]}]
                     {:state  state
                      :by-key (assoc (if (identical? current state) by-key {}) [cache-key registry-key] result)}))))

(defn- walk-registry-key
  "The result of the schema registered as `registry-key`: walked once per walk, and cached across walks unless a
  cycle cut it short."
  [schema registry-key trail {:keys [in-progress cycles seen cut-short cache-key], :as state}]
  (cond
    (external-registry-key? registry-key)
    {:typed? true}

    (contains? @in-progress registry-key)
    (do (vswap! cycles conj registry-key)
        {:typed? true})

    :else
    (let [result (or (cached-result cache-key registry-key)
                     (when-let [result (get @seen registry-key)]
                       (when (contains? @cut-short registry-key)
                         (vswap! cycles conj registry-key))
                       result)
                     (do
                       (vswap! in-progress conj registry-key)
                       (let [result (-> (if-let [dereffed (deref-safe schema)]
                                          (walk dereffed [] state)
                                          {:typed? true})
                                        (update :passes one-per-schema)
                                        (update :nested one-per-schema))]
                         (vswap! in-progress disj registry-key)
                         (vswap! cycles disj registry-key)
                         (vswap! seen assoc registry-key result)
                         (if (empty? @cycles)
                           (when (mr/registered-schema registry-key)
                             (cache-result! cache-key registry-key result))
                           (vswap! cut-short conj registry-key))
                         result)))]
      (under result (conj trail registry-key)))))

(defn- walk-map [schema trail state]
  (let [children (mc/children schema)
        skip?    (partial (:skip-entry? state) schema)
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
        open?                     ((:open-key? state) key-schema)]
    {:passes (when open? [(finding schema trail :keyword-keyed-map-of)])
     :typed? (not open?)
     :nested (vec (unstripped (walk value-schema (conj trail 1) state)))}))

(defn- walk-and
  "An `:and` lets through what all its conjuncts do, so one conjunct that declares the whole value settles it."
  [schema trail state]
  (let [results (for [[k child] (child-schemas schema)]
                  (walk child (conj trail k) state))
        decides (or (seq (remove :guard? results)) results)
        typed?  (boolean (some :typed? decides))
        passes  (when-not typed? (mapcat :passes decides))
        nested  (mapcat :nested results)
        keep    (if (some (fn [result] (and (not (:guard? result)) (empty? (failing (unstripped result))))) decides)
                  (partial filter #(= (:kind %) :open-map))
                  identity)]
    {:passes (vec (keep passes))
     :typed? typed?
     :guard? (every? :guard? results)
     :nested (vec (keep nested))}))

(defn- walk-leaf [schema trail {:keys [any-schema? guards?]}]
  (let [guard? (and guards? (= (mc/type schema) :fn))]
    (cond
      (any-schema? schema)                {:passes [(finding schema trail :any)], :guard? guard?}
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
        (walk-leaf schema trail state)))
    {:typed? true}))

(defn findings
  "Everything reachable from `schema` that lets a value through undeclared, each a map of `:kind` (`:any`,
  `:keyword-keyed-map-of` or `:open-map`), the `:trail` of map keys, child indexes and registry keys that leads to it
  from the root, and its `:form`, under the options `:any-schema?` and `:open-key?`, the rules for a leaf that accepts a
  value of any shape and for a `:map-of` key that accepts any keyword, with `:cache-key` naming them, `:guards?`,
  whether a `:fn` is a guard that types nothing, and `:skip-entry?`, a `(fn [map-schema k])` for map entries not to
  walk."
  ([schema]
   (findings schema {}))
  ([schema {rule :any-schema?, key-rule :open-key?, :keys [cache-key skip-entry? guards?]}]
   (one-per-schema (unstripped (walk schema [] {:in-progress (volatile! #{})
                                                :seen        (volatile! {})
                                                :cut-short   (volatile! #{})
                                                :cycles      (volatile! #{})
                                                :any-schema? (or rule any-schema?)
                                                :open-key?   (or key-rule (constantly false))
                                                :guards?     (boolean guards?)
                                                :cache-key   (or cache-key ::any-schema)
                                                :skip-entry? (or skip-entry? (constantly false))})))))

(defn forget-results!
  "Drop every cached result, so the next walk sees schemas redefined since."
  []
  (reset! results {}))

(defn describe-findings
  "A line per finding, for an error message."
  [found]
  (str/join "\n" (for [{:keys [trail kind form]} found]
                   (format "  %s at %s: %s"
                           (case kind
                             :any                  "any value"
                             :keyword-keyed-map-of "keyword-keyed map-of")
                           (if (seq trail) (pr-str trail) "the root")
                           (pr-str form)))))

(defn failing-findings
  "The failing findings of `schema` under `options`, walked again from scratch when the cached results report any."
  [schema options]
  (when (seq (failing (findings schema options)))
    (forget-results!)
    (not-empty (vec (failing (findings schema options))))))

(defn check-args!
  "Throw when an argument schema of `fn-name`, or an argument without one, can reach a schema that accepts a value of
  any shape."
  [fn-name arg-schemas]
  (when *enabled*
    (when-let [found (not-empty (into [] (mapcat #(failing-findings % {})) arg-schemas))]
      (throw (ex-info (format (str "The arguments of %s reach schemas that accept anything. Give every argument a"
                                   " schema and give :any a type:\n%s")
                              fn-name
                              (describe-findings found))
                      {:fn-name fn-name, :findings found})))))

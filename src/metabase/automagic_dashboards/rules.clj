(ns metabase.automagic-dashboards.rules
  "Validation, transformation to cannonical form, and loading of heuristics."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.automagic-dashboards.populate :as populate]
            [metabase.types]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema
             [coerce :as sc]
             [core :as s]]
            [yaml.core :as yaml]))

(def ^Long ^:const max-score
  "Maximal (and default) value for heuristics scores."
  100)

(def ^:private Score (s/constrained s/Int #(<= 0 % max-score)
                                    (str "0 <= score <= " max-score)))

(def ^:private MBQL [s/Any])

(def ^:private Identifier s/Str)

(def ^:private Metric {Identifier {(s/required-key :metric) MBQL
                                   (s/required-key :score)  Score}})

(def ^:private Filter {Identifier {(s/required-key :filter) MBQL
                                   (s/required-key :score)  Score}})

(defn ga-dimension?
  "Does string `t` denote a Google Analytics dimension?"
  [t]
  (str/starts-with? t "ga:"))

(defn ->type
  "Turn `x` into proper type name."
  [x]
  (cond
    (keyword? x)      x
    (ga-dimension? x) x
    :else             (keyword "type" x)))

(defn ->entity
  "Turn `x` into proper entity name."
  [x]
  (cond
    (keyword? x)      x
    (ga-dimension? x) x
    :else             (keyword "entity" x)))

(defn- field-type?
  [t]
  (isa? t :type/*))

(defn- table-type?
  [t]
  (isa? t :entity/*))

(def ^:private TableType (s/constrained s/Keyword table-type?))
(def ^:private FieldType (s/either (s/constrained s/Str ga-dimension?)
                                   (s/constrained s/Keyword field-type?)))

(def ^:private FieldSpec (s/either [FieldType]
                                   [(s/one TableType "table") FieldType]))

(def ^:private Dimension {Identifier {(s/required-key :field_type)      FieldSpec
                                      (s/required-key :score)           Score
                                      (s/optional-key :links_to)        TableType
                                      (s/optional-key :aggregation)     s/Str
                                      (s/optional-key :named)           s/Str
                                      (s/optional-key :max_cardinality) s/Int}})

(def ^:private OrderByPair {Identifier (s/enum "descending" "ascending")})

(def ^:private Visualization [(s/one s/Str "visualization") su/Map])

(def ^:private Width  (s/constrained s/Int #(<= 1 % populate/grid-width)
                                     (format "1 <= width <= %s"
                                             populate/grid-width)))
(def ^:private Height (s/constrained s/Int pos?))

(def ^:private Card
  {Identifier {(s/required-key :title)         s/Str
               (s/required-key :score)         Score
               (s/optional-key :visualization) Visualization
               (s/optional-key :text)          s/Str
               (s/optional-key :dimensions)    [s/Str]
               (s/optional-key :filters)       [s/Str]
               (s/optional-key :metrics)       [s/Str]
               (s/optional-key :limit)         su/IntGreaterThanZero
               (s/optional-key :order_by)      [OrderByPair]
               (s/optional-key :description)   s/Str
               (s/optional-key :query)         s/Str
               (s/optional-key :width)         Width
               (s/optional-key :height)        Height
               (s/optional-key :group)         s/Str}})

(def ^:private Groups
  {Identifier {(s/required-key :title)       s/Str
               (s/optional-key :description) s/Str}})

(def ^:private ^{:arglists '([definitions])} identifiers
  (comp set (partial map (comp key first))))

(defn- all-references
  [k cards]
  (mapcat (comp k val first) cards))

(def ^:private DimensionForm
  [(s/one (s/constrained (s/either s/Str s/Keyword)
                         (comp #{"dimension"} str/lower-case name))
          "dimension")
   s/Str])

(def ^{:arglists '([form])} dimension-form?
  "Does form denote a dimension referece?"
  (complement (s/checker DimensionForm)))

(defn collect-dimensions
  "Return all dimension references in form."
  [form]
  (->> form
       (tree-seq (some-fn map? sequential?) identity)
       (mapcat (fn [subform]
                 (cond
                   (dimension-form? subform) [(second subform)]
                   (string? subform)         (->> subform
                                                  (re-seq #"\[\[(\w+)\]\]")
                                                  (map second))
                   :else                     nil)))
       distinct))

(defn- valid-references?
  "Check if all references to metrics, dimensions, and filters are valid (ie.
   have a corresponding definition)."
  [{:keys [metrics dimensions filters cards groups dashboard_filters] :as rule}]
  (let [defined-dimensions (identifiers dimensions)
        defined-metrics    (identifiers metrics)
        defined-filters    (identifiers filters)]
    (and (every? defined-metrics (all-references :metrics cards))
         (every? defined-filters (all-references :filters cards))
         (every? defined-dimensions (all-references :dimensions cards))
         (every? groups (keep (comp :group val first) cards))
         (every? (comp (into defined-dimensions defined-metrics) key first)
                 (all-references :order_by cards))
         (every? (some-fn defined-dimensions (comp table-type? ->entity) #{"this"})
                 (collect-dimensions rule))
         (every? defined-dimensions dashboard_filters))))

(def ^:private Rules
  (s/constrained
   {(s/required-key :title)             s/Str
    (s/required-key :dimensions)        [Dimension]
    (s/required-key :cards)             [Card]
    (s/required-key :rule)              s/Str
    (s/optional-key :table_type)        TableType
    (s/optional-key :description)       s/Str
    (s/optional-key :metrics)           [Metric]
    (s/optional-key :filters)           [Filter]
    (s/optional-key :groups)            Groups
    (s/optional-key :dashboard_filters) [s/Str]}
   valid-references? "Valid references"))

(defn- with-defaults
  [defaults]
  (fn [x]
    (let [[identifier definition] (first x)]
      {identifier (merge defaults definition)})))

(defn- shorthand-definition
  "Expand definition of the form {identifier value} with regards to key `k` into
   {identifier {k value}}."
  [k]
  (fn [x]
    (let [[identifier definition] (first x)]
      (if (map? definition)
        x
        {identifier {k definition}}))))

(defn- ensure-seq
  [x]
  (if (or (sequential? x) (nil? x))
    x
    [x]))

(def ^:private rules-validator
  (sc/coercer!
   Rules
   {[s/Str]       ensure-seq
    [OrderByPair] ensure-seq
    FieldSpec     (fn [x]
                    (let [[table-type field-type] (str/split x #"\.")]
                      (if field-type
                        [(->entity table-type) (->type field-type)]
                        [(->type table-type)])))
    OrderByPair   (fn [x]
                    (if (string? x)
                      {x "ascending"}
                      x))
    Visualization (fn [x]
                    (if (string? x)
                      [x {}]
                      (first x)))
    Metric        (comp (with-defaults {:score max-score})
                        (shorthand-definition :metric))
    Dimension     (comp (with-defaults {:score max-score})
                        (shorthand-definition :field_type))
    Filter        (comp (with-defaults {:score max-score})
                        (shorthand-definition :filter))
    Card          (with-defaults {:score  max-score
                                  :width  populate/default-card-width
                                  :height populate/default-card-height})
    TableType     ->entity
    FieldType     ->type
    Identifier    (fn [x]
                    (if (keyword? x)
                      (name x)
                      x))
    Groups        (partial apply merge)}))

(def ^:private rules-dir "resources/automagic_dashboards/")

(def ^:private ^{:arglists '([f])} file-name->table-type
  (comp (partial re-find #".+(?=\.yaml)") (memfn ^java.io.File getName)))

(defn load-rule
  "Load and validate rule from file `f`."
  [f]
  (let [^java.io.File f (if (string? f)
                          (java.io.File. (str rules-dir f))
                          f)]
    (try
      (-> f
          slurp
          yaml/parse-string
          (assoc :rule (file-name->table-type f))
          (update :table_type #(or % (file-name->table-type f)))
          rules-validator)
      (catch Exception e
        (log/error (format "Error parsing %s:\n%s"
                           (.getName f)
                           (or (some-> e
                                       ex-data
                                       (select-keys [:error :value])
                                       u/pprint-to-str)
                               e)))
        nil))))

(defn load-rules
  "Load and validate all rules in dir."
  ([] (load-rules rules-dir))
  ([dir]
   (->> dir
        clojure.java.io/file
        .listFiles
        (filter (memfn ^java.io.File isFile))
        (keep load-rule))))

(def ^{:arglists '([rule])} indepth
  "Load and validate indepth refinement for given rule."
  (comp load-rules (partial str rules-dir "/") name))

(defn -main
  "Entry point for lein task `validate-automagic-dashboards`"
  [& _]
  (dorun (load-rules))
  (System/exit 0))

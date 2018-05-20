(ns metabase.automagic-dashboards.rules
  "Validation, transformation to cannonical form, and loading of heuristics."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.automagic-dashboards.populate :as populate]
            [metabase.types]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :as i18n :refer [trs]]
            [schema
             [coerce :as sc]
             [core :as s]]
            [yaml.core :as yaml])
  (:import java.nio.file.Path java.nio.file.FileSystems java.nio.file.FileSystem
           java.nio.file.Files))

(def ^Long ^:const max-score
  "Maximal (and default) value for heuristics scores."
  100)

(def ^:private Score (s/constrained s/Int #(<= 0 % max-score)
                                    (format (trs "0 <= score <= %s") max-score)))

(def ^:private MBQL [s/Any])

(def ^:private Identifier s/Str)

(def ^:private Metric {Identifier {(s/required-key :metric) MBQL
                                   (s/required-key :score)  Score
                                   (s/optional-key :name)   s/Str}})

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
(def ^:private FieldType (s/cond-pre (s/constrained s/Str ga-dimension?)
                                     (s/constrained s/Keyword field-type?)))

(def ^:private AppliesTo (s/either [FieldType]
                                   [TableType]
                                   [(s/one TableType "table") FieldType]))

(def ^:private Dimension {Identifier {(s/required-key :field_type)      AppliesTo
                                      (s/required-key :score)           Score
                                      (s/optional-key :links_to)        TableType
                                      (s/optional-key :named)           s/Str
                                      (s/optional-key :max_cardinality) s/Int}})

(def ^:private OrderByPair {Identifier (s/enum "descending" "ascending")})

(def ^:private Visualization [(s/one s/Str "visualization") su/Map])

(def ^:private Width  (s/constrained s/Int #(<= 1 % populate/grid-width)
                                     (format (trs "1 <= width <= %s")
                                             populate/grid-width)))
(def ^:private Height (s/constrained s/Int pos?))

(def ^:private CardDimension {Identifier {(s/optional-key :aggregation) s/Str}})

(def ^:private Card
  {Identifier {(s/required-key :title)         s/Str
               (s/required-key :score)         Score
               (s/optional-key :visualization) Visualization
               (s/optional-key :text)          s/Str
               (s/optional-key :dimensions)    [CardDimension]
               (s/optional-key :filters)       [s/Str]
               (s/optional-key :metrics)       [s/Str]
               (s/optional-key :limit)         su/IntGreaterThanZero
               (s/optional-key :order_by)      [OrderByPair]
               (s/optional-key :description)   s/Str
               (s/optional-key :query)         s/Str
               (s/optional-key :width)         Width
               (s/optional-key :height)        Height
               (s/optional-key :group)         s/Str
               (s/optional-key :y_label)       s/Str
               (s/optional-key :x_label)       s/Str
               (s/optional-key :series_labels) [s/Str]}})

(def ^:private Groups
  {Identifier {(s/required-key :title)       s/Str
               (s/optional-key :description) s/Str}})

(def ^{:arglists '([definition])} identifier
  "Return `key` in `{key {}}`."
  (comp key first))

(def ^:private ^{:arglists '([definitions])} identifiers
  (partial into #{"this"} (map identifier)))

(defn- all-references
  [k cards]
  (mapcat (comp k val first) cards))

(def ^:private DimensionForm
  [(s/one (s/constrained (s/cond-pre s/Str s/Keyword)
                         (comp #{"dimension"} str/lower-case name))
          "dimension")
   (s/one s/Str "identifier")
   su/Map])

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

(defn- valid-metrics-references?
  [{:keys [metrics cards]}]
  (every? (identifiers metrics) (all-references :metrics cards)))

(defn- valid-filters-references?
  [{:keys [filters cards]}]
  (every? (identifiers filters) (all-references :filters cards)))

(defn- valid-group-references?
  [{:keys [cards groups]}]
  (every? groups (keep (comp :group val first) cards)))

(defn- valid-order-by-references?
  [{:keys [dimensions metrics cards]}]
  (every? (comp (into (identifiers dimensions)
                      (identifiers metrics))
                identifier)
          (all-references :order_by cards)))

(defn- valid-dimension-references?
  [{:keys [dimensions] :as rule}]
  (every? (some-fn (identifiers dimensions) (comp table-type? ->entity))
          (collect-dimensions rule)))

(defn- valid-dashboard-filters-references?
  [{:keys [dimensions dashboard_filters]}]
  (every? (identifiers dimensions) dashboard_filters))

(defn- valid-breakout-dimension-references?
  [{:keys [cards dimensions]}]
  (->> cards
       (all-references :dimensions)
       (map identifier)
       (every? (identifiers dimensions))))

(defn- constrained-all
  [schema & constraints]
  (reduce (partial apply s/constrained)
          schema
          (partition 2 constraints)))

(def Rule
  "Rules defining an automagic dashboard."
  (constrained-all
   {(s/required-key :title)             s/Str
    (s/required-key :dimensions)        [Dimension]
    (s/required-key :cards)             [Card]
    (s/required-key :rule)              s/Str
    (s/optional-key :applies_to)        AppliesTo
    (s/optional-key :transient_title)   s/Str
    (s/optional-key :short_title)       s/Str
    (s/optional-key :description)       s/Str
    (s/optional-key :metrics)           [Metric]
    (s/optional-key :filters)           [Filter]
    (s/optional-key :groups)            Groups
    (s/optional-key :indepth)           [s/Any]
    (s/optional-key :dashboard_filters) [s/Str]}
   valid-metrics-references?            (trs "Valid metrics references")
   valid-filters-references?            (trs "Valid filters references")
   valid-group-references?              (trs "Valid group references")
   valid-order-by-references?           (trs "Valid order_by references")
   valid-dashboard-filters-references?  (trs "Valid dashboard filters references")
   valid-dimension-references?          (trs "Valid dimension references")
   valid-breakout-dimension-references? (trs "Valid card dimension references")))

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

(defn ensure-seq
  "Wrap `x` into a vector if it is not already a sequence."
  [x]
  (if (or (sequential? x) (nil? x))
    x
    [x]))

(def ^:private rules-validator
  (sc/coercer!
   Rule
   {[s/Str]         ensure-seq
    [OrderByPair]   ensure-seq
    OrderByPair     (fn [x]
                      (if (string? x)
                        {x "ascending"}
                        x))
    Visualization   (fn [x]
                      (if (string? x)
                        [x {}]
                        (first x)))
    Metric          (comp (with-defaults {:score max-score})
                          (shorthand-definition :metric))
    Dimension       (comp (with-defaults {:score max-score})
                          (shorthand-definition :field_type))
    Filter          (comp (with-defaults {:score max-score})
                          (shorthand-definition :filter))
    Card            (with-defaults {:score  max-score
                                    :width  populate/default-card-width
                                    :height populate/default-card-height})
    [CardDimension] ensure-seq
    CardDimension   (fn [x]
                      (if (string? x)
                        {x {}}
                        x))
    TableType       ->entity
    FieldType       ->type
    Identifier      (fn [x]
                      (if (keyword? x)
                        (name x)
                        x))
    Groups          (partial apply merge)
    AppliesTo       (fn [x]
                      (let [[table-type field-type] (str/split x #"\.")]
                        (if field-type
                          [(->entity table-type) (->type field-type)]
                          [(if (-> table-type ->entity table-type?)
                             (->entity table-type)
                             (->type table-type))])))}))

(def ^:private rules-dir "automagic_dashboards/")

(def ^:private ^{:arglists '([f])} file->entity-type
  (comp (partial re-find #".+(?=\.yaml$)") str (memfn ^Path getFileName)))

(defn- load-rule
  [^Path f]
  (try
    (let [entity-type (file->entity-type f)]
      (-> f
          .toUri
          slurp
          yaml/parse-string
          (assoc :rule entity-type)
          (update :applies_to #(or % entity-type))
          rules-validator))
    (catch Exception e
      (log/errorf (trs "Error parsing %s:\n%s")
                  (.getFileName f)
                  (or (some-> e
                              ex-data
                              (select-keys [:error :value])
                              u/pprint-to-str)
                      e))
      nil)))

(defn- trim-trailing-slash
  [s]
  (if (str/ends-with? s "/")
    (subs s 0 (-> s count dec))
    s))

(defn- load-rule-dir
  ([dir] (load-rule-dir dir [] {}))
  ([dir path rules]
   (with-open [ds (Files/newDirectoryStream dir)]
     (reduce (fn [rules ^Path f]
               (cond
                 (Files/isDirectory f (into-array java.nio.file.LinkOption []))
                 (load-rule-dir f (->> f (.getFileName) str trim-trailing-slash (conj path)) rules)

                 (file->entity-type f)
                 (assoc-in rules (concat path [(file->entity-type f) ::leaf]) (load-rule f))

                 :else
                 rules))
             rules
             ds))))

(defmacro ^:private with-resource
  [[identifier path] & body]
  `(let [[jar# path#] (-> ~path .toString (str/split #"!" 2))]
     (if path#
       (with-open [^FileSystem fs# (-> jar#
                                       java.net.URI/create
                                       (FileSystems/newFileSystem (java.util.HashMap.)))]
         (let [~identifier (.getPath fs# path# (into-array String []))]
           ~@body))
       (let [~identifier (.getPath (FileSystems/getDefault) (.getPath ~path) (into-array String []))]
         ~@body))))

(def ^:private rules (delay
                      (with-resource [path (-> rules-dir io/resource .toURI)]
                        (into {} (load-rule-dir path)))))

(defn get-rules
  "Get all rules with prefix `prefix`.
   prefix is greedy, so [\"table\"] will match table/TransactionTable.yaml, but not
   table/TransactionTable/ByCountry.yaml"
  [prefix]
  (->> prefix
       (get-in @rules)
       (keep (comp ::leaf val))))

(defn get-rule
  "Get rule at path `path`."
  [path]
  (get-in @rules (concat path [::leaf])))

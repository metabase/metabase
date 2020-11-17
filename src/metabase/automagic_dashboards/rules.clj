(ns metabase.automagic-dashboards.rules
  "Validation, transformation to cannonical form, and loading of heuristics."
  (:require [clojure.string :as str]
            [metabase.automagic-dashboards.populate :as populate]
            [metabase.query-processor.util :as qp.util]
            [metabase.util :as u]
            [metabase.util
             [files :as files]
             [i18n :as i18n :refer [deferred-trs LocalizedString]]
             [schema :as su]
             [yaml :as yaml]]
            [schema
             [coerce :as sc]
             [core :as s]]
            [schema.spec.core :as spec])
  (:import [java.nio.file Files Path]))

(def ^Long ^:const max-score
  "Maximal (and default) value for heuristics scores."
  100)

(def ^:private Score (s/constrained s/Int #(<= 0 % max-score)
                                    (deferred-trs "0 <= score <= {0}" max-score)))

(def ^:private MBQL [s/Any])

(def ^:private Identifier s/Str)

(def ^:private Metric {Identifier {(s/required-key :metric) MBQL
                                   (s/required-key :score)  Score
                                   (s/optional-key :name)   LocalizedString}})

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
                                     (deferred-trs "1 <= width <= {0}" populate/grid-width)))
(def ^:private Height (s/constrained s/Int pos?))

(def ^:private CardDimension {Identifier {(s/optional-key :aggregation) s/Str}})

(def ^:private Card
  {Identifier {(s/required-key :title)         LocalizedString
               (s/required-key :score)         Score
               (s/optional-key :visualization) Visualization
               (s/optional-key :text)          LocalizedString
               (s/optional-key :dimensions)    [CardDimension]
               (s/optional-key :filters)       [s/Str]
               (s/optional-key :metrics)       [s/Str]
               (s/optional-key :limit)         su/IntGreaterThanZero
               (s/optional-key :order_by)      [OrderByPair]
               (s/optional-key :description)   LocalizedString
               (s/optional-key :query)         s/Str
               (s/optional-key :width)         Width
               (s/optional-key :height)        Height
               (s/optional-key :group)         s/Str
               (s/optional-key :y_label)       LocalizedString
               (s/optional-key :x_label)       LocalizedString
               (s/optional-key :series_labels) [LocalizedString]}})

(def ^:private Groups
  {Identifier {(s/required-key :title)            LocalizedString
               (s/optional-key :comparison_title) LocalizedString
               (s/optional-key :description)      LocalizedString}})

(def ^{:arglists '([definition])} identifier
  "Return `key` in `{key {}}`."
  (comp key first))

(def ^:private ^{:arglists '([definitions])} identifiers
  (partial into #{"this"} (map identifier)))

(defn- all-references
  [k cards]
  (mapcat (comp k val first) cards))

(def ^:private DimensionForm
  [(s/one (s/constrained (s/cond-pre s/Str s/Keyword) (comp #{:dimension} qp.util/normalize-token))
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
                                                  (map second)))))
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
   {(s/required-key :title)             LocalizedString
    (s/required-key :rule)              s/Str
    (s/required-key :specificity)       s/Int
    (s/optional-key :cards)             [Card]
    (s/optional-key :dimensions)        [Dimension]
    (s/optional-key :applies_to)        AppliesTo
    (s/optional-key :transient_title)   LocalizedString
    (s/optional-key :description)       LocalizedString
    (s/optional-key :metrics)           [Metric]
    (s/optional-key :filters)           [Filter]
    (s/optional-key :groups)            Groups
    (s/optional-key :indepth)           [s/Any]
    (s/optional-key :dashboard_filters) [s/Str]}
   valid-metrics-references?            (deferred-trs "Valid metrics references")
   valid-filters-references?            (deferred-trs "Valid filters references")
   valid-group-references?              (deferred-trs "Valid group references")
   valid-order-by-references?           (deferred-trs "Valid order_by references")
   valid-dashboard-filters-references?  (deferred-trs "Valid dashboard filters references")
   valid-dimension-references?          (deferred-trs "Valid dimension references")
   valid-breakout-dimension-references? (deferred-trs "Valid card dimension references")))

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

(def ^:private rules-validator
  (sc/coercer!
   Rule
   {[s/Str]         u/one-or-many
    [OrderByPair]   u/one-or-many
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
    [CardDimension] u/one-or-many
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
                             (->type table-type))])))
    LocalizedString (fn [s]
                      (i18n/->UserLocalizedString s nil))}))

(def ^:private rules-dir "automagic_dashboards/")

(def ^:private ^{:arglists '([f])} file->entity-type
  (comp (partial re-find #".+(?=\.yaml$)") str (memfn ^Path getFileName)))

(defn- specificity
  [rule]
  (transduce (map (comp count ancestors)) + (:applies_to rule)))

(defn- make-rule
  [entity-type r]
  (-> r
      (assoc :rule        entity-type
             :specificity 0)
      (update :applies_to #(or % entity-type))
      rules-validator
      (as-> rule (assoc rule :specificity (specificity rule)))))

(defn- trim-trailing-slash
  [s]
  (if (str/ends-with? s "/")
    (subs s 0 (-> s count dec))
    s))

(defn- load-rule-dir
  ([dir] (load-rule-dir dir [] {}))
  ([dir path rules]
   (with-open [ds (Files/newDirectoryStream dir)]
     (reduce
      (fn [rules ^Path f]
        (let [entity-type (file->entity-type f)]
          (cond
            (Files/isDirectory f (into-array java.nio.file.LinkOption []))
            (load-rule-dir f (->> f (.getFileName) str trim-trailing-slash (conj path)) rules)

            entity-type
            (assoc-in rules (concat path [entity-type ::leaf]) (yaml/load (partial make-rule entity-type) f))

            :else
            rules)))
      rules
      ds))))

(def ^:private rules (delay
                      (files/with-open-path-to-resource [path rules-dir]
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

(defn- extract-localized-strings
  [[path rule]]
  (let [strings (atom [])]
    ((spec/run-checker
      (fn [s params]
        (let [walk (spec/checker (s/spec s) params)]
          (fn [x]
            (when (= LocalizedString s)
              (swap! strings conj x))
            (walk x))))
      false
      Rule)
     rule)
    (map vector (distinct @strings) (repeat path))))

(defn- make-pot
  [strings]
  (->> strings
       (group-by first)
       (mapcat (fn [[s ctxs]]
                 (concat (for [[_ ctx] ctxs]
                           (format "#: resources/%s%s.yaml" rules-dir (str/join "/" ctx)))
                         [(format "msgid \"%s\"\nmsgstr \"\"\n" s)])))
       (str/join "\n")))

(defn- all-rules
  ([]
   (all-rules [] @rules))
  ([path rules]
   (when (map? rules)
     (mapcat (fn [[k v]]
               (if (= k ::leaf)
                 [[path v]]
                 (all-rules (conj path k) v)))
             rules))))

(defn -main
  "Entry point for lein task `generate-automagic-dashboards-pot`"
  [& _]
  (->> (all-rules)
       (mapcat extract-localized-strings)
       make-pot
       (spit "locales/metabase-automatic-dashboards.pot"))
  (System/exit 0))

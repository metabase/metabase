(ns metabase.automagic-dashboards.dashboard-templates
  "Validation, transformation to canonical form, and loading of heuristics."
  (:gen-class)
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.automagic-dashboards.populate :as populate]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :as i18n :refer [deferred-trs LocalizedString]]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.schema :as su]
   [metabase.util.yaml :as yaml]
   [metabase.util.malli.schema :as ms]
   [schema.coerce :as sc]
   [schema.core :as s]
   [schema.spec.core :as spec])
  (:import
   (java.nio.file Files Path)))

(set! *warn-on-reflection* true)

(def ^Long ^:const max-score
  "Maximal (and default) value for heuristics scores."
  100)

(def ^:private Score [:int {:min 0 :max 100}])

(def ^:private MBQL [:sequential :any])

(def ^:private Identifier :string)

(def ^:private Metric [:map-of Identifier [:map {:closed true}
                                           [:metric MBQL]
                                           [:score Score]
                                           [:name {:optional true} LocalizedString]]])

(def ^:private Filter
 [:map-of Identifier [:map {:closed true}
                           [:filter MBQL]
                           [:score Score]]])

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
  (some
   (partial isa? t)
   [:type/* :Semantic/* :Relation/*]))

(defn- table-type?
  [t]
  (isa? t :entity/*))

(def ^:private TableType [:and :keyword table-type?])
(def ^:private FieldType [:or
                          [:and :string ga-dimension?]
                          [:keyword field-type?]])

(def ^:private AppliesTo
  [:or
   [:sequential FieldType]
   [:sequential TableType]
   [:tuple TableType FieldType]])

(def ^:private Dimension
  [:map-of Identifier [:map {:closed true}
                       [:field_type                       AppliesTo]
                       [:score                            Score]
                       [:links_to        {:optional true} TableType]
                       [:named           {:optional true} :string]
                       [:max_cardinality {:optional true} :int]]])


(def ^:private OrderByPair [:map-of Identifier [:enum "descending" "ascending"]])

(def ^:private Visualization [:sequential [:tuple :string :map]])

(def ^:private Width  [:int
                       {:min 1 :max populate/grid-width}])

(def ^:private Height [:and :int pos?])

(def ^:private CardDimension [:map-of Identifier [:map {:closed true}
                                                  [:aggregation {:optional true} :string]]])

(def ^:private Card
  [:map-of Identifier [:map {:closed true}
                       [:title         LocalizedString]
                       [:score         Score]
                       [:visualization {:optional true}  Visualization]
                       [:text {:optional true}           LocalizedString]
                       [:dimensions {:optional true}     [:sequential CardDimension]]
                       [:filters {:optional true}        [:sequential :string]]
                       [:metrics {:optional true}        [:sequential :string]]
                       [:limit {:optional true}          su/IntGreaterThanZero]
                       [:order_by {:optional true}       [:sequential OrderByPair]]
                       [:description {:optional true}    LocalizedString]
                       [:query {:optional true}          :string]
                       [:width {:optional true}          Width]
                       [:height {:optional true}         Height]
                       [:group {:optional true}          :string]
                       [:y_label {:optional true}        LocalizedString]
                       [:x_label {:optional true}        LocalizedString]
                       [:series_labels {:optional true}  [:sequential LocalizedString]]]])

(def ^:private Groups
  [:map-of Identifier [:map {:closed true}
                       [:title            LocalizedString]
                       [:comparison_title {:optional true}  LocalizedString]
                       [:description {:optional true}       LocalizedString]]])

(def ^{:arglists '([definition])} identifier
  "Return `key` in `{key {}}`."
  (comp key first))

(def ^:private ^{:arglists '([definitions])} identifiers
  (partial into #{"this"} (map identifier)))

(defn- all-references
  [k cards]
  (mapcat (comp k val first) cards))

(def ^:private DimensionForm
  [:tuple
   [:and [:or :string :keyword] [:fn (comp #{:dimension} qp.util/normalize-token)]]
   :string
   :map])

(def ^{:arglists '([form])} dimension-form?
  "Does form denote a dimension reference?"
  (mc/validator DimensionForm))

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
  [{:keys [dimensions] :as dashboard-template}]
  (every? (some-fn (identifiers dimensions) (comp table-type? ->entity))
          (collect-dimensions dashboard-template)))

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

(def DashboardTemplate
  "Specification defining an automagic dashboard."
  (constrained-all
    {(s/required-key :title)                   LocalizedString
     (s/required-key :dashboard-template-name) s/Str
     (s/required-key :specificity)             s/Int
     (s/optional-key :cards)                   [Card]
     (s/optional-key :dimensions)              [Dimension]
     (s/optional-key :applies_to)              AppliesTo
     (s/optional-key :transient_title)         LocalizedString
     (s/optional-key :description)             LocalizedString
     (s/optional-key :metrics)                 [Metric]
     (s/optional-key :filters)                 [Filter]
     (s/optional-key :groups)                  Groups
     (s/optional-key :indepth)                 [s/Any]
     (s/optional-key :dashboard_filters)       [s/Str]}
    valid-metrics-references? (deferred-trs "Valid metrics references")
    valid-filters-references? (deferred-trs "Valid filters references")
    valid-group-references? (deferred-trs "Valid group references")
    valid-order-by-references? (deferred-trs "Valid order_by references")
    valid-dashboard-filters-references? (deferred-trs "Valid dashboard filters references")
    valid-dimension-references? (deferred-trs "Valid dimension references")
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

(def ^:private dashboard-template-validator
  identity
  #_(sc/coercer!
      DashboardTemplate
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
                         (i18n/->UserLocalizedString s nil {}))}))

(def ^:private dashboard-templates-dir "automagic_dashboards/")

(def ^:private ^{:arglists '([f])} file->entity-type
  (comp (partial re-find #".+(?=\.yaml$)") str (memfn ^Path getFileName)))

(defn- specificity
  [dashboard-template]
  (transduce (map (comp count ancestors)) + (:applies_to dashboard-template)))

(defn- make-dashboard-template
  [entity-type r]
  (-> r
      (assoc :dashboard-template-name entity-type
             :specificity 0)
      (update :applies_to #(or % entity-type))
      dashboard-template-validator
      (as-> dashboard-template
            (assoc dashboard-template
              :specificity (specificity dashboard-template)))))

(defn- trim-trailing-slash
  [s]
  (if (str/ends-with? s "/")
    (subs s 0 (-> s count dec))
    s))

(defn- load-dashboard-template-dir
  ([dir] (load-dashboard-template-dir dir [] {}))
  ([dir path dashboard-templates]
   (with-open [ds (Files/newDirectoryStream dir)]
     (reduce
      (fn [acc ^Path f]
        (let [entity-type (file->entity-type f)]
          (cond
            (Files/isDirectory f (into-array java.nio.file.LinkOption []))
            (load-dashboard-template-dir f (->> f (.getFileName) str trim-trailing-slash (conj path)) acc)

            entity-type
            (assoc-in acc (concat path [entity-type ::leaf]) (yaml/load (partial make-dashboard-template entity-type) f))

            :else
            acc)))
      dashboard-templates
      ds))))

(def ^:private dashboard-templates
  (delay
    (u.files/with-open-path-to-resource [path dashboard-templates-dir]
                                        (into {} (load-dashboard-template-dir path)))))

(defn get-dashboard-templates
  "Get all dashboard templates with prefix `prefix`.
   prefix is greedy, so [\"table\"] will match table/TransactionTable.yaml, but not
   table/TransactionTable/ByCountry.yaml"
  [prefix]
  (->> prefix
       (get-in @dashboard-templates)
       (keep (comp ::leaf val))))

(defn get-dashboard-template
  "Get dashboard template at path `path`."
  [path]
  (get-in @dashboard-templates (concat path [::leaf])))

(defn- extract-localized-strings
  [[path dashboard-template]]
  (let [strings (atom [])]
    ((spec/run-checker
       (fn [s params]
        (let [walk (spec/checker (s/spec s) params)]
          (fn [x]
            (when (= LocalizedString s)
              (swap! strings conj x))
            (walk x))))
       false
       DashboardTemplate)
     dashboard-template)
    (map vector (distinct @strings) (repeat path))))

(defn- make-pot
  [strings]
  (->> strings
       (group-by first)
       (mapcat (fn [[s ctxs]]
                 (concat (for [[_ ctx] ctxs]
                           (format "#: resources/%s%s.yaml" dashboard-templates-dir (str/join "/" ctx)))
                         [(format "msgid \"%s\"\nmsgstr \"\"\n" s)])))
       (str/join "\n")))

(defn- all-dashboard-templates
  ([]
   (all-dashboard-templates [] @dashboard-templates))
  ([path dashboard-templates]
   (when (map? dashboard-templates)
     (mapcat (fn [[k v]]
               (if (= k ::leaf)
                 [[path v]]
                 (all-dashboard-templates (conj path k) v)))
             dashboard-templates))))

(defn -main
  "Entry point for Clojure CLI task `generate-automagic-dashboards-pot`. Run it with

    clojure -M:generate-automagic-dashboards-pot"
  [& _]
  (->> (all-dashboard-templates)
       (mapcat extract-localized-strings)
       make-pot
       (spit "locales/metabase-automatic-dashboards.pot"))
  (System/exit 0))

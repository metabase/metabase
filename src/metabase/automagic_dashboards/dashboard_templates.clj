(ns metabase.automagic-dashboards.dashboard-templates
  "Validation, transformation to canonical form, and loading of heuristics."
  (:gen-class)
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.automagic-dashboards.populate :as populate]
   [metabase.query-processor.util :as qp.util]
   [metabase.shared.dashboards.constants :as dashboards.constants]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :as i18n :refer [deferred-trs LocalizedString]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [schema.spec.core :as spec])
  (:import
   (java.nio.file Files Path)))

(set! *warn-on-reflection* true)

(def ^Long ^:const max-score
  "Maximal (and default) value for heuristics scores."
  100)

(def ^:private Score
  [:int {:min           0
         :max           :max-score
         :error/message (deferred-trs "0 <= score <= {0}" max-score)}])

(def ^:private MBQL [:sequential :any])

(def ^:private Identifier :string)

(def ^:private Metric
  [:map-of Identifier [:map
                       [:metric MBQL]
                       [:score  Score]
                       [:name {:optional true} LocalizedString]]])

(def ^:private Filter
  [:map-of Identifier [:map
                       [:filter MBQL]
                       [:score  Score]]])

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

(def ^:private TableType
  [:and
   :keyword
   [:fn {:error/message "valid table type"} table-type?]])

(def ^:private FieldType
  [:or
   [:and
    :string
    [:fn {:error/message "Google Analytics dimension"} ga-dimension?]]
   [:and
    :keyword
    [:fn {:error/message "Valid Field type"} field-type?]]])

(def ^:private AppliesTo
  [:or
   [:sequential FieldType]
   [:sequential TableType]
   [:cat TableType [:* FieldType]]])

(def ^:private Dimension
  [:map-of
   Identifier
   [:map
    [:field_type AppliesTo]
    [:score      Score]
    [:links_to        {:optional true} TableType]
    [:named           {:optional true} :string]
    [:max_cardinality {:optional true} :int]]])

(def ^:private OrderByPair
  [:map-of Identifier [:enum "descending" "ascending"]])

(def ^:private Visualization
  [:cat :string [:* :map]])

(def ^:private Width
  [:int {:min 1, :max populate/grid-width}])

(def ^:private Height pos-int?)

(def ^:private CardDimension
  [:map-of Identifier [:map [:aggregation {:optional true} :string]]])

(def ^:private Card
  [:map-of
   Identifier
   [:map
    [:title      LocalizedString]
    [:card-score Score]
    [:visualization {:optional true} Visualization]
    [:text          {:optional true} LocalizedString]
    [:dimensions    {:optional true} [:sequential CardDimension]]
    [:filters       {:optional true} [:sequential :string]]
    [:metrics       {:optional true} [:sequential :string]]
    [:limit         {:optional true} pos-int?]
    [:order_by      {:optional true} [:sequential OrderByPair]]
    [:description   {:optional true} LocalizedString]
    [:query         {:optional true} :string]
    [:width         {:optional true} Width]
    [:height        {:optional true} Height]
    [:group         {:optional true} :string]
    [:y_label       {:optional true} LocalizedString]
    [:x_label       {:optional true} LocalizedString]
    [:series_labels {:optional true} [:sequential LocalizedString]]]])

(def ^:private Groups
  [:map-of
   Identifier
   [:map
    [:title LocalizedString]
    [:score :int]
    [:comparison_title {:optional true} LocalizedString]
    [:description      {:optional true} LocalizedString]]])

(def ^{:arglists '([definition])} identifier
  "Return `key` in `{key {}}`."
  (comp key first))

(def ^:private ^{:arglists '([definitions])} identifiers
  (partial into #{"this"} (map identifier)))

(defn- all-references
  [k cards]
  (mapcat (comp k val first) cards))

(def ^:private DimensionForm
  [:cat
   [:and
    [:or :string :keyword]
    [:fn
     {:error/message ":dimension"}
     (comp #{:dimension} qp.util/normalize-token)]]
   :string
   [:* :map]])

(def ^{:arglists '([form])} dimension-form?
  "Does form denote a dimension reference?"
  (mr/validator DimensionForm))

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

(def DashboardTemplate
  "Specification defining an automagic dashboard."
  [:and
   [:map
    [:title                   LocalizedString]
    [:dashboard-template-name :string]
    [:specificity             :int]
    [:cards             {:optional true} [:sequential Card]]
    [:dimensions        {:optional true} [:sequential Dimension]]
    [:applies_to        {:optional true} AppliesTo]
    [:transient_title   {:optional true} LocalizedString]
    [:description       {:optional true} LocalizedString]
    [:metrics           {:optional true} [:sequential Metric]]
    [:filters           {:optional true} [:sequential Filter]]
    [:groups            {:optional true} Groups]
    [:indepth           {:optional true} [:sequential :any]]
    [:dashboard_filters {:optional true} [:string]]]
   [:fn {:error/message "Valid metrics references"}           valid-metrics-references?]
   [:fn {:error/message "Valid filters references"}           valid-filters-references?]
   [:fn {:error/message "Valid group references"}             valid-group-references?]
   [:fn {:error/message "Valid order_by references"}          valid-order-by-references?]
   [:fn {:error/message "Valid dashboard filters references"} valid-dashboard-filters-references?]
   [:fn {:error/message "Valid dimension references"}         valid-dimension-references?]
   [:fn {:error/message "Valid card dimension references"}    valid-breakout-dimension-references?]])

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

;; FIXME NOCOMMIT
(def ^:private dashboard-template-validator
  identity
  #_(sc/coercer!
    DashboardTemplate
    {[:string]         u/one-or-many
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
     Card            (with-defaults {:card-score max-score
                                     :width      populate/default-card-width
                                     :height     populate/default-card-height})
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

(defn- ensure-default-card-sizes
  "Given a card definition from a template, fill in the card template with default width and height
  values based on the template display type if those dimensions aren't already present."
  [card-spec]
  (update-vals
    card-spec
    (fn [{:keys [visualization] :as card-spec}]
      (let [defaults (get-in dashboards.constants/card-size-defaults [(keyword visualization) :default])]
        (into defaults card-spec)))))

(defn- set-default-card-dimensions
  "Update the card template dimensions to align with the default FE dimensions."
  [dashboard-template]
  (update dashboard-template :cards #(mapv ensure-default-card-sizes %)))

(defn- make-dashboard-template
  [entity-type {:keys [cards] :as r}]
  (-> (cond-> r
        (seq cards)
        (update :cards (partial mapv (fn [m] (update-vals m #(set/rename-keys % {:score :card-score}))))))
      (assoc :dashboard-template-name entity-type
             :specificity 0)
      (update :applies_to #(or % entity-type))
      set-default-card-dimensions
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
       (fn [schema params]
        (let [walk (spec/checker (mr/validator schema) params)]
          (fn [x]
            (when (= LocalizedString schema)
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

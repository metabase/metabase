(ns metabase.xrays.automagic-dashboards.core
  "# Automagic Dashboards #

  Automatically generate questions and dashboards based on predefined heuristics.

  Note that the primary entry point into this namespace is `automagic-analysis`. This function primarily gathers
  needed data about the input value and any special options then calls into `automagic-dashboard`, where most of
  the work occurs.

  There are two key inputs to this algorithm:
  - An entity to generate the dashboard for. The primary data needed from this entity is:
    - The entity type itself
    - The field information, especially the metadata about these fields
    - This data gathering happens in the `->root` function
  - A dashboard template from which a dashboard can be realized based on the entity and field data

  ## Template Selection ##

  Within the `automagic-dashboard` function, a template is selected based on the entity type being analyzed unless a
  dashboard template is specified in the argument. This is a critically important fact:

  ** The template selection is based on the entity type of the item being x-rayed.  **

  Example: X-raying the \"ORDERS\" table will result in matching the template
  `resources/automagic_dashboards/table/TransactionTable.yaml`.

  This is because the `:entity_type` of the table is `:entity/TransactionTable` as can be seen here:

  ```clojure
  (t2/select-one-fn :entity_type :model/Table :name \"ORDERS\")
  ;=> :entity/TransactionTable
  ```

  _Most_ tables and _all_ models (as of this writing) will bottom out at `:entity/GenericTable` and thus, use the
  `resources/automagic_dashboards/table/GenericTable.yaml` template. `:entity_type` for a given table type is made in
  the [[metabase.analyze.core/infer-entity-type-by-name]] function, where the primary logic is table naming based on the
  `prefix-or-postfix` var in that ns.

  ProTip: If you want to introduce a new template type, do the following:

  1. Update `prefix-or-postfix` to include the match logic and new entity type
  2. Add a template file, `resources/automagic_dashboards/table/NewEntityType.yaml`, where NewEntityType is the new
     entity type (e.g. `:entity/NewEntityType`).

  ## Template Files ##

  Template files define a potential dashboard, potentially including titles, seconds, cards, filters, and more.
  They are found in `resources/automagic_dashboards`. Once you've read through several, the format should be fairly
  self-explanatory, but here are a few critical details:

  - Templated strings are matched with `[[double square brackets]]`
  - `title`, `transient_title`, and `description` should be self-explanatory
  - The fundamental \"dynamic\" building blocks are:
    - dimensions - The base building block in the process. Dimensions map to the columns of the entity being x-rayed
      and are matched by dimension field_type to entity type (semantic, effective, etc.). These form the x-axis in a
      card and the breakout column of a query.
    - metrics - Metrics form the y-axis in a card and are the aggregates in a query. They are always defined in terms
      of 0 or more dimensions. Metrics can be dimensionless quantities (e.g. count), based on a single value (e.g.
      average of a column), or a more complicated expression (e.g. ratio of average of column 1 and average of column 2).
    - filters - Filters add a filter clause to a query and are also defined in terms of dimensions.
    - cards - The final product of the dynamic process. Cards are built from predefined metrics, dimensions, and
      filters as discussed above along with preferences such as display type and title.
    - groups - Dashboard sections in which matching cards are added.

  ## The Dynamic Binding and Dashboard Generation Process ##

  Once data has been accreted in [[automagic-analysis]], [[automagic-dashboard]] will first select a template as described
  above. It then calls [[metabase.xrays.automagic-dashboards.interesting/identify]] which takes the actual column data and
  dimension, metric, and filter definitions from the template and matches all potential columns to potential dimensions,
  metrics, and filters. The resulting \"grounded-values\" are now passed into [[generate-dashboard]], which matches all
  of these values to card templates to produce a dashboard. The majority of the card generation work is done in
  [[metabase.xrays.automagic-dashboards.combination/grounded-metrics->dashcards]].

  Note that if a card template's dimensions, metrics, and filters are not matched to grounded values the card will not
  be generated. Conversely, if a card template can be matched by multiple combinations of dimensions, multiple cards
  may be generated.

  Once a selection of cards have been generated, the top N are selected (default 15), added to the dashboard, and grouped.

  ## Example ##

  The following example is provided to better illustrate the template process and how dimensions and metrics work.

  This is a notional dashboard template:

                              Card 1: You have N Items!

              Card 2:                      Card 3:                       Card 4:
        Avg Income over Time        Total Income per Category            X vs. Y
                   ___
      Avg  |    __/                  Total | #     #                 | *    *      *
    Income | __/                    Income | #  #  #               X |    ***
           |/                              | #  #  #  #              |      ***   *  *
           +----------                     +-----------              +-----------------
              Time                           Category                        Y

  Key things to note:
  - Each dimension _in a card_ is specified by *name*.
  - There are 5 dimensions across all cards:
    - Income
    - Time
    - Category
    - X
    - Y
  - There are 3 metrics:
    - Count (N Items)
    - Avg Income
    - Total Income
  - Each metric is a _computed value_ based on 0 or more dimensions, also specified by *name*.
    - Count is dimensionless
    - Avg and Total require the Income dimensions
    - Not shown, but a card such as \"Sales by Location\" could require 3 dimensions:
      - Total of the Sales dimension
      - Longitude and Latitude dimensions
    - A metric can also have multiple dimensions with its calculated value, such as the quotient of 2 dimensions.
  - Not described here are filters, which have the same nominal syntax for referencing dimensions as cards and metrics.

   Dimensions are the key Lego™ brick for all of the above and are specified as a named element with specialization
   based on entity and field semantic types as well as a score.

   For example, Income could have the following potential matches to underlying fields:
   - A field from a Sales table with semantic type `:type/Income` and score of 100
   - A field from an unspecified table with semantic type `:type/Income` and score of 90
   - A field from a Sales table with semantic type `:type/Number` and score of 50

   When matched with actual fields from an x-rayed entity, the highest matching field, by score, is selected to be
   \"bound\" to the Income dimensions. Suppose you have an entity of type SalesTable and fields of INCOME (semantic
   type Income), TAX (type Float), and TOTAL (Float). In this case, the INCOME field would match best (score 100)
   and be bound to the Income dimension.

   The other specified dimensions will have similar matching rules. Note that X & Y are, like all other dimensions,
   *named* dimensions. In our above example the Income dimension matched to the INCOME field of type `:type/Income`.
   This happens to be well-aligned data. X and Y might look like:
   - X is a field from the Sales table of type `:type/Decimal`
   - Y is a field from the Sales table of type `:type/Decimal`
   So long as two fields match the above criteria (decimal types (including descendants) and from a Sales table), they
   can be bound to the X and Y dimensions. They could be, for example, TAX and TOTAL.

   The above example, starting from the dashboard template, works backwards from the actual x-ray generation algorithm
   but should provide clarity as to the terminology and how everything fits together.

   In practice, we gather the entity data (including fields), the dashboard templates, attempt to bind dimensions to
   fields specified in the template, then build metrics, filters, and finally cards based on the bound dimensions."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [kixi.stats.core :as stats]
   [kixi.stats.math :as math]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.query-processor.util :as qp.util]
   [metabase.segments.schema :as segments.schema]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru trun]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.xrays.automagic-dashboards.combination :as combination]
   [metabase.xrays.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.xrays.automagic-dashboards.filters :as filters]
   [metabase.xrays.automagic-dashboards.interesting :as interesting]
   [metabase.xrays.automagic-dashboards.names :as names]
   [metabase.xrays.automagic-dashboards.populate :as populate]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [metabase.xrays.related :as related]
   [toucan2.core :as t2]))

(def ^:private public-endpoint "/auto/dashboard/")

(def ^:private ^{:arglists '([field])} id-or-name
  (some-fn :id :name))

(defmulti ->root
  "root is a datatype that is an entity augmented with metadata for the purposes of creating an automatic dashboard with
  respect to that entity. It is called a root because the automated dashboard uses productions to recursively create a
  tree of dashboard cards to fill the dashboards. This multimethod is for turning a given entity into a root."
  {:arglists '([entity])}
  mi/model)

(mu/defmethod ->root :model/Table :- ::ads/root
  [table]
  {:entity                     table
   :full-name                  (:display_name table)
   :short-name                 (:display_name table)
   :source                     table
   :database                   (:db_id table)
   :url                        (format "%stable/%s" public-endpoint (u/the-id table))
   :dashboard-templates-prefix ["table"]})

(mu/defmethod ->root :model/Segment :- ::ads/root
  [segment :- [:map [:definition ::segments.schema/segment]]]
  (let [table (->> segment :table_id (t2/select-one :model/Table :id))]
    {:entity                     segment
     :full-name                  (tru "{0} in the {1} segment" (:display_name table) (:name segment))
     :short-name                 (:display_name table)
     :comparison-name            (tru "{0} segment" (:name segment))
     :source                     table
     :database                   (:db_id table)
     :query-filter               [(lib/segment (u/the-id segment))]
     :url                        (format "%ssegment/%s" public-endpoint (u/the-id segment))
     :dashboard-templates-prefix ["table"]}))

(mu/defmethod ->root :xrays/Metric :- ::ads/root
  [{:keys [table-id], :as metric} :- ::ads/metric]
  (let [table (some->> table-id (t2/select-one :model/Table :id))]
    {:entity                     metric
     :full-name                  (if (:id metric)
                                   (trun "{0} metric" "{0} metrics" (:name metric))
                                   (:name metric))
     :short-name                 (:name metric)
     :source                     table
     :database                   (or (:db_id table)
                                     (:xrays/database-id metric))
     ;; We use :id here as it might not be a concrete field but rather one from a nested query which
     ;; does not have an ID.
     :url                        (format "%smetric/%s" public-endpoint (:id metric))
     :dashboard-templates-prefix ["metric"]}))

(mu/defmethod ->root :model/Field :- ::ads/root
  [field :- ::ads/field]
  (let [table (field/table field)]
    {:entity                     field
     :full-name                  (trun "{0} field" "{0} fields" (:display_name field))
     :short-name                 (:display_name field)
     :source                     table
     :database                   (or (:db_id table) (:xrays/database-id field))
     ;; We use :id here as it might not be a concrete metric but rather one from a nested query
     ;; which does not have an ID.
     :url                        (format "%sfield/%s" public-endpoint (:id field))
     :dashboard-templates-prefix ["field"]}))

(mu/defn- source-card-id [card-or-question :- [:map
                                               [:dataset_query ::ads/query]]]
  (lib/source-card-id (:dataset_query card-or-question)))

(mu/defn- nested-query?
  "Is this card or question derived from another model or question?"
  [card-or-question :- [:map
                        [:dataset_query ::ads/query]]]
  (some? (source-card-id card-or-question)))

(mu/defn- native-query?
  "Is this card or question native (SQL)?"
  [{query :dataset_query, :as _card-or-question} :- [:map
                                                     [:dataset_query ::ads/query]]]
  (lib/native-only-query? query))

(mu/defn- source-question :- [:maybe (ms/InstanceOf :model/Card)]
  [card-or-question :- [:map
                        [:dataset_query ::ads/query]]]
  (when-let [source-card-id (source-card-id card-or-question)]
    (t2/select-one :model/Card :id source-card-id)))

(mu/defn- table-like?
  [{query :dataset_query, :as _card-or-question} :- [:map
                                                     [:dataset_query ::ads/query]]]
  (and
   (empty? (lib/aggregations query))
   (empty? (lib/breakouts query))))

(defn- table-id
  "Get the Table ID from `card-or-question`, which can be either a Card from the DB (which has a `:table_id` property)
  or an ad-hoc query (referred to as a 'question' in this namespace) created with the
  [[metabase.xrays.api.automagic-dashboards/adhoc-query-instance]] function, which has a `:table-id` property."
  ;; TODO - probably better if we just changed `adhoc-query` to use the same keys as Cards (e.g. `:table_id`) so we
  ;; didn't need this function, seems like something that would be too easy to forget
  [card-or-question]
  ((some-fn :table-id :table_id) card-or-question))

(mu/defn- source
  [card :- [:map
            [:dataset_query ::ads/query]]]
  (cond
    ;; This is a model
    (= (:type card) :model) (assoc card :entity_type :entity/GenericTable)
    ;; This is a query based on a query. Eventually we will want to change this as it suffers from the same sourcing
    ;; problems as other cards -- The x-ray is not done on the card, but on its source.
    (nested-query? card)    (-> card
                                source-question
                                (assoc :entity_type :entity/GenericTable))
    (native-query? card)    (-> card (assoc :entity_type :entity/GenericTable))
    :else                   (->> card table-id (t2/select-one :model/Table :id))))

(mu/defmethod ->root :model/Card :- ::ads/root
  [card :- [:map
            [:dataset_query ::ads/query]]]
  (let [source (source card)]
    {:entity                     card
     :source                     source
     :database                   (:database_id card)
     :query-filter               (lib/filters (:dataset_query card))
     :full-name                  (tru "\"{0}\"" (:name card))
     :short-name                 (names/source-name {:source source})
     :url                        (format "%s%s/%s" public-endpoint (name (:type source :question)) (u/the-id card))
     :dashboard-templates-prefix [(if (table-like? card)
                                    "table"
                                    "question")]}))

(mu/defmethod ->root :model/Query :- ::ads/root
  [query :- [:map
             [:database-id ::lib.schema.id/database]]]
  (let [source (source query)
        root   {:database (:database-id query), :source source}]
    {:entity                     query
     :source                     source
     :database                   (:database-id query)
     :query-filter               (lib/filters (:dataset_query query))
     :full-name                  (cond
                                   (native-query? query) (tru "Native query")
                                   (table-like? query)   (-> source ->root :full-name)
                                   :else                 (names/question-description root query))
     :short-name                 (names/source-name root)
     :url                        (format "%sadhoc/%s" public-endpoint
                                         (magic.util/encode-base64-json (:dataset_query query)))
     :dashboard-templates-prefix [(if (table-like? query)
                                    "table"
                                    "question")]}))

;; NOTE - This has been lifted to foo. Nuke it here as well.
(defn- fill-templates
  [template-type {:keys [root tables]} bindings s]
  (let [bindings (some-fn (merge {"this" (-> root
                                             :entity
                                             (assoc :full-name (:full-name root)))}
                                 bindings)
                          (comp first #(magic.util/filter-tables % tables) dashboard-templates/->entity)
                          identity)]
    (str/replace s #"\[\[(\w+)(?:\.([\w\-]+))?\]\]"
                 (fn [[_ identifier attribute]]
                   (let [entity    (bindings identifier)
                         attribute (some-> attribute qp.util/normalize-token)]
                     (str (or (and (ifn? entity) (entity attribute))
                              (root attribute)
                              (interesting/->reference template-type entity))))))))

(defn- instantiate-visualization
  [[k v] dimensions metrics]
  (let [dimension->name (comp vector :name dimensions)
        metric->name    (comp vector first :metric metrics)]
    [k (-> v
           (m/update-existing :map.latitude_column dimension->name)
           (m/update-existing :map.longitude_column dimension->name)
           (m/update-existing :graph.metrics metric->name)
           (m/update-existing :graph.dimensions dimension->name))]))

(defn capitalize-first
  "Capitalize only the first letter in a given string."
  [s]
  (let [s (str s)]
    (str (u/upper-case-en (subs s 0 1)) (subs s 1))))

(defn- instantiate-metadata
  [x context available-metrics bindings]
  (-> (walk/postwalk
       (fn [form]
         (if (i18n/localized-string? form)
           (let [s     (str form)
                 new-s (fill-templates :string context bindings s)]
             (if (not= new-s s)
               (capitalize-first new-s)
               s))
           form))
       x)
      (m/update-existing :visualization #(instantiate-visualization % bindings available-metrics))))

(mu/defn- singular-cell-dimension-field-ids :- [:maybe [:set [:or :string ::lib.schema.id/field]]]
  "Return the set of ids referenced in a cell query"
  [{:keys [cell-query], :as _root} :- ::ads/root]
  (letfn [(collect-dimensions [[tag _opts & args]]
            ;; TODO (Cam 10/21/25) -- piccing apart MBQL clauses like this is a little icky and unidiomatic, we really
            ;; don't discourage digging around in MBQL outside of Lib -- FIXME
            (case (some-> tag keyword)
              :and          (mapcat collect-dimensions args)
              (:between :=) (magic.util/collect-field-references args)
              nil))]
    (into #{}
          (map magic.util/field-reference->id)
          (collect-dimensions cell-query))))

(defn- matching-dashboard-templates
  "Return matching dashboard templates ordered by specificity.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [dashboard-templates {:keys [source entity]}]
  ;; Should this be here or lifted to the calling context. It's a magic step.
  (let [table-type (or (:entity_type source) :entity/GenericTable)]
    (->> dashboard-templates
         (filter (fn [{:keys [applies_to]}]
                   (let [[entity-type field-type] applies_to]
                     (and (isa? table-type entity-type)
                          (or (nil? field-type)
                              (magic.util/field-isa? entity field-type))))))
         (sort-by :specificity >))))

(defn- linked-tables
  "Return all tables accessible from a given table with the paths to get there.
   If there are multiple FKs pointing to the same table, multiple entries will
   be returned."
  [table]
  (for [{:keys [id target]} (field/with-targets
                              (t2/select :model/Field
                                         :table_id           (u/the-id table)
                                         :fk_target_field_id [:not= nil]
                                         :active             true))
        :when (some-> target mi/can-read?)]
    (-> target field/table (assoc :link id))))

(defn- source->db [source]
  (let [db-id (or ((some-fn :db_id :database_id) source)
                  (throw (ex-info "Source is missing Database ID"
                                  {:source source})))]
    (t2/select-one :model/Database :id db-id)))

(defn- relevant-fields
  "Source fields from tables that are applicable to the entity being x-rayed."
  [{:keys [source _entity] :as _root} tables]
  (let [db (source->db source)]
    (if (mi/instance-of? :model/Table source)
      (comp (->> (-> (t2/select :model/Field
                                :table_id [:in (map u/the-id tables)]
                                :visibility_type "normal"
                                :preview_display true
                                :active true)
                     (t2/hydrate :has_field_values [:dimensions :human_readable_field] :name_field))
                 field/with-targets
                 (map #(assoc % :db db))
                 (group-by :table_id))
            u/the-id)
      (if (table-like? source)
        (let [source-fields (->> source
                                 :result_metadata
                                 (map (fn [field]
                                        (as-> field field
                                          (update field :base_type keyword)
                                          (update field :semantic_type keyword)
                                          (mi/instance :model/Field field)
                                          (analyze/run-classifiers field {})
                                          (assoc field :db db)))))]
          (constantly source-fields))
        (constantly [])))))

(mu/defn- make-base-context :- ::ads/context
  "Create the underlying context to which we will add metrics, dimensions, and filters.

  This is applicable to all dashboard templates."
  [{:keys [source] :as root} :- ::ads/root]
  {:pre [source]}
  (let [tables        (concat [source] (when (mi/instance-of? :model/Table source)
                                         (linked-tables source)))
        table->fields (relevant-fields root tables)]
    {:source       (assoc source :fields (table->fields source))
     :root         root
     :tables       (map #(assoc % :fields (table->fields %)) tables)
     :query-filter (filters/inject-refinement (:query-filter root) (:cell-query root))}))

(defn- make-dashboard
  ([root dashboard-template]
   (make-dashboard root dashboard-template {:tables [(:source root)] :root root} nil))
  ([root dashboard-template context {:keys [available-metrics]}]
   (-> dashboard-template
       (select-keys [:title :description :transient_title :groups])
       (cond->
        (:comparison? root)
         (update :groups (partial m/map-vals (fn [{:keys [title comparison_title] :as group}]
                                               (assoc group :title (or comparison_title title))))))
       (instantiate-metadata context available-metrics {}))))

(mu/defn- generate-base-dashboard :- ::ads/dashboard-template
  "Produce the \"base\" dashboard from the base context for an item and a dashboard template.
  This includes dashcards and global filters, but does not include related items and is not yet populated.
  Repeated calls of this might be generated (e.g. the main dashboard and related) then combined once using
  create dashboard."
  [{root :root :as base-context} :- ::ads/context
   {template-cards      :cards
    :keys               [dashboard_filters]
    :as                 dashboard-template}
   {grounded-dimensions :dimensions
    grounded-metrics    :metrics
    grounded-filters    :filters} :- ::ads/grounded-values]
  (let [card-templates  (interesting/normalize-seq-of-maps :card template-cards)
        dashcards       (combination/grounded-metrics->dashcards
                         base-context
                         card-templates
                         grounded-dimensions
                         grounded-filters
                         grounded-metrics)
        empty-dashboard (make-dashboard root dashboard-template)]
    (assoc empty-dashboard
           ;; Adds the filters that show at the top of the dashboard
           ;; Why do we need (or do we) the last remove form?
           :filters (->> dashboard_filters
                         (mapcat (comp :matches grounded-dimensions))
                         (remove (comp (singular-cell-dimension-field-ids root) id-or-name)))
           :cards dashcards)))

(def ^:private ^:const ^Long max-related 8)
(def ^:private ^:const ^Long max-cards 15)
(def ^:private ^:const ^Long max-cards-total 30)

(defn ->related-entity
  "Turn `entity` into an entry in `:related.`"
  [entity]
  (let [{:keys [dashboard-templates-prefix] :as root} (->root entity)
        candidate-templates (dashboard-templates/get-dashboard-templates dashboard-templates-prefix)
        dashboard-template  (->> root
                                 (matching-dashboard-templates candidate-templates)
                                 first)
        dashboard           (make-dashboard root dashboard-template)]
    {:url         (:url root)
     :title       (:full-name root)
     :description (:description dashboard)}))

(defn- related-entities
  [root]
  (-> root
      :entity
      related/related
      (update :fields (partial remove magic.util/key-col?))
      (->> (m/map-vals (comp (partial map ->related-entity) u/one-or-many)))))

(mu/defn- indepth
  [{:keys [dashboard-templates-prefix url] :as root}
   {:keys [dashboard-template-name]} :- [:maybe dashboard-templates/DashboardTemplate]]
  (let [base-context (make-base-context root)]
    (->> (dashboard-templates/get-dashboard-templates (concat dashboard-templates-prefix [dashboard-template-name]))
         (keep (fn [{indepth-template-name :dashboard-template-name
                     template-dimensions   :dimensions
                     template-metrics      :metrics
                     template-filters      :filters
                     :as                   indepth}]
                 (let [grounded-values (interesting/identify
                                        base-context
                                        {:dimension-specs template-dimensions
                                         :metric-specs    template-metrics
                                         :filter-specs    template-filters})
                       {:keys [description cards] :as dashboard} (generate-base-dashboard
                                                                  base-context
                                                                  indepth
                                                                  grounded-values)]
                   (when (and description (seq cards))
                     {:title       ((some-fn :short-title :title) dashboard)
                      :description description
                      :url         (format "%s/rule/%s/%s" url dashboard-template-name indepth-template-name)}))))
         (hash-map :indepth))))

(defn- drilldown-fields
  [root available-dimensions]
  (when (->> root :source (mi/instance-of? :model/Table))
    (->> available-dimensions
         vals
         (mapcat :matches)
         (filter mi/can-read?)
         filters/interesting-fields
         (map ->related-entity)
         (hash-map :drilldown-fields))))

(mu/defn- comparisons
  [root :- [:map
            [:database ::lib.schema.id/database]]]
  {:compare (concat
             (for [segment (->> root :entity related/related :segments (map ->root))]
               {:url         (str (:url root) "/compare/segment/" (-> segment :entity u/the-id))
                :title       (tru "Compare with {0}" (:comparison-name segment))
                :description ""})
             (when ((some-fn :query-filter :cell-query) root)
               [{:url         (if (->> root :source (mi/instance-of? :model/Table))
                                (str (:url root) "/compare/table/" (-> root :source u/the-id))
                                (str (:url root) "/compare/adhoc/"
                                     (magic.util/encode-base64-json
                                      {:database (:database root)
                                       :type     :query
                                       :query    {:source-table (->> root
                                                                     :source
                                                                     u/the-id
                                                                     (str "card__"))}})))
                 :title       (tru "Compare with entire dataset")
                 :description ""}]))})

(defn- fill-related
  "We fill available slots round-robin style. Each selector is a list of fns that are tried against
   `related` in sequence until one matches."
  [available-slots selectors related]
  (let [pop-first         (fn [m ks]
                            (loop [[k & ks] ks]
                              (let [item (-> k m first)]
                                (cond
                                  item        [item (update m k rest)]
                                  (empty? ks) [nil m]
                                  :else       (recur ks)))))
        count-leafs        (comp count (partial mapcat val))
        [selected related] (reduce-kv
                            (fn [[selected related] k v]
                              (loop [[selector & remaining-selectors] v
                                     related                          related
                                     selected                         selected]
                                (let [[next related] (pop-first related (mapcat shuffle selector))
                                      num-selected   (count-leafs selected)]
                                  (cond
                                    (= num-selected available-slots)
                                    (reduced [selected related])

                                    next
                                    (recur remaining-selectors related (update selected k conj next))

                                    (empty? remaining-selectors)
                                    [selected related]

                                    :else
                                    (recur remaining-selectors related selected)))))
                            [{} related]
                            selectors)
        num-selected (count-leafs selected)]
    (if (pos? num-selected)
      (merge-with concat
                  selected
                  (fill-related (- available-slots num-selected) selectors related))
      {})))

(def ^:private related-selectors
  {:model/Table   (let [down     [[:indepth] [:segments :metrics] [:drilldown-fields]]
                        sideways [[:linking-to :linked-from] [:tables]]
                        compare  [[:compare]]]
                    {:zoom-in [down down down down]
                     :related [sideways sideways]
                     :compare [compare compare]})
   :model/Segment (let [down     [[:indepth] [:segments :metrics] [:drilldown-fields]]
                        sideways [[:linking-to] [:tables]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down down]
                     :zoom-out [up]
                     :related  [sideways sideways]
                     :compare  [compare compare]})
   :xrays/Metric  (let [down     [[:drilldown-fields]]
                        sideways [[:metrics :segments]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down]
                     :zoom-out [up]
                     :related  [sideways sideways sideways]
                     :compare  [compare compare]})
   :model/Field   (let [sideways [[:fields]]
                        up       [[:table] [:metrics :segments]]
                        compare  [[:compare]]]
                    {:zoom-out [up]
                     :related  [sideways sideways]
                     :compare  [compare]})
   :model/Card    (let [down     [[:drilldown-fields]]
                        sideways [[:metrics] [:similar-questions :dashboard-mates]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down]
                     :zoom-out [up]
                     :related  [sideways sideways sideways]
                     :compare  [compare compare]})
   :model/Query   (let [down     [[:drilldown-fields]]
                        sideways [[:metrics] [:similar-questions]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down]
                     :zoom-out [up]
                     :related  [sideways sideways sideways]
                     :compare  [compare compare]})})

(mu/defn- related
  "Build a balanced list of related X-rays. General composition of the list is determined for each
   root type individually via `related-selectors`. That recipe is then filled round-robin style."
  [root
   available-dimensions
   dashboard-template :- [:maybe dashboard-templates/DashboardTemplate]]
  (->> (merge (indepth root dashboard-template)
              (drilldown-fields root available-dimensions)
              (related-entities root)
              (comparisons root))
       (fill-related max-related (get related-selectors (-> root :entity mi/model)))))

(mu/defn- generate-dashboard
  "Produce a fully-populated dashboard from the base context for an item and a dashboard template."
  [{{:keys [show url query-filter] :as root} :root :as base-context} :- ::ads/context
   {:as dashboard-template}
   {grounded-dimensions :dimensions :as grounded-values} :- ::ads/grounded-values]
  (let [show      (or show max-cards)
        dashboard (generate-base-dashboard base-context dashboard-template grounded-values)]
    (-> dashboard
        (populate/create-dashboard show)
        (assoc
         :related (related
                   root grounded-dimensions
                   dashboard-template)
         :more (when (and (not= show :all)
                          (-> dashboard :cards count (> show)))
                 (format "%s#show=all" url))
         :transient_filters query-filter
         :param_fields (group-by magic.util/filter-id-for-field (:filters dashboard))
         :auto_apply_filters true
         :width "fixed"))))

(mu/defn- automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  [{:keys [dashboard-template dashboard-templates-prefix] :as root} :- ::ads/root]
  (let [base-context    (make-base-context root)
        {template-dimensions :dimensions
         template-metrics    :metrics
         template-filters    :filters
         :as                 template} (if dashboard-template
                                         (dashboard-templates/get-dashboard-template dashboard-template)
                                         (first (matching-dashboard-templates
                                                 (dashboard-templates/get-dashboard-templates dashboard-templates-prefix)
                                                 root)))
        grounded-values (interesting/identify
                         base-context
                         {:dimension-specs template-dimensions
                          :metric-specs    template-metrics
                          :filter-specs    template-filters})]
    (generate-dashboard base-context template grounded-values)))

(mr/def ::automagic-analysis.opts
  [:maybe
   [:map
    {:closed true}
    [:cell-query         {:optional true} [:maybe ::ads/root.cell-query]]
    [:show               {:optional true} [:maybe [:or pos-int? [:= :all]]]]
    [:source             {:optional true} ::ads/source]
    [:query-filter       {:optional true} [:maybe
                                           [:schema
                                            {:decode/normalize (fn [filters]
                                                                 (when (seq filters)
                                                                   (if (sequential? (first filters))
                                                                     filters
                                                                     [filters])))}
                                            [:sequential ::ads/filter-clause]]]]
    [:database           {:optional true} ::lib.schema.id/database]
    [:comparison?        {:optional true} [:maybe :boolean]]
    [:rules-prefix       {:optional true} [:maybe [:sequential :string]]]
    ;; TODO -- use [[metabase.xrays.api.automagic-dashboards/DashboardTemplate]] (move it somewhere first)
    [:dashboard-template {:optional true} [:maybe [:sequential :string]]]]])

(defmulti ^:private automagic-analysis-method
  {:arglists '([entity opts])}
  (fn [entity _]
    (mi/model entity)))

(defn automagic-analysis
  "Create a transient dashboard analyzing given entity.

  This function eventually calls out to `automagic-dashboard` with two primary arguments:
  - The item to be analyzed. This entity is a 'decorated' version of the raw input that has been
    passed through the `->root` function, which is an aggregate including the original entity, its
    source, what dashboard template categories to apply, etc.
  - Additional options such as how many cards to show, a cell query (a drill through), etc."
  [entity opts]
  (automagic-analysis-method
   (lib/normalize ::ads/root.entity entity)
   (lib/normalize ::automagic-analysis.opts opts)))

(defmethod automagic-analysis-method :model/Table
  [table opts]
  (automagic-dashboard (merge (->root table) opts)))

(mu/defmethod automagic-analysis-method :model/Segment
  [segment :- [:map [:definition ::segments.schema/segment]]
   opts]
  (automagic-dashboard (merge (->root segment) opts)))

(mu/defmethod automagic-analysis-method :xrays/Metric
  [metric :- ::ads/metric
   opts]
  (automagic-dashboard (merge (->root metric) opts)))

(mu/defn- collect-metrics :- [:maybe [:sequential [:and
                                                   (ms/InstanceOf :xrays/Metric)
                                                   ::ads/metric]]]
  [root     :- ::ads/root
   question :- [:map
                [:dataset_query ::ads/query]]]
  (map (mu/fn [aggregation-clause :- ::lib.schema.aggregation/aggregation]
         (if (lib/clause-of-type? aggregation-clause :metric)
           ;; any [:metric ...] MBQL clauses these days are V2 Metrics and Automagic Dashboards do not handle them.
           (log/error "X-Rays do not support V2 Metrics.")
           (let [table-id (table-id question)]
             (mi/instance :xrays/Metric {:xrays/aggregation aggregation-clause
                                         :name              (names/metric->description root aggregation-clause)
                                         :table-id          table-id
                                         :xrays/database-id ((some-fn :database-id :database_id) question)}))))
       (lib/aggregations (:dataset_query question))))

(mu/defn- collect-breakout-fields :- [:maybe [:sequential (ms/InstanceOf :model/Field)]]
  [root     :- ::ads/root
   question :- [:map
                [:dataset_query ::ads/query]]]
  (for [breakout     (lib/breakouts (:dataset_query question))
        field-clause (take 1 (magic.util/collect-field-references breakout))
        :let         [field (magic.util/->field root field-clause)]
        :when        (and field
                          (= (:table_id field) (table-id question)))]
    field))

(mu/defn- decompose-question
  [root     :- ::ads/root
   question :- [:map
                [:dataset_query ::ads/query]]
   opts]
  (letfn [(analyze [x]
            (try
              (automagic-analysis
               (assoc x :xrays/database-id (:database root))
               (assoc opts
                      :source       (:source root)
                      :query-filter (:query-filter root)
                      :database     (:database root)))
              (catch Throwable e
                (throw (ex-info (tru "Error decomposing question: {0}" (ex-message e))
                                {:root root, :question question, :object x}
                                e)))))]
    (into []
          (comp cat (map analyze))
          [(collect-metrics root question)
           (collect-breakout-fields root question)])))

(mu/defn- preserve-entity-element
  "Ensure that elements of an original dataset query are preserved in dashcard queries."
  [dashboard
   entity
   getter-fn
   setter-fn]
  ;; disable ref validation because X-Rays does stuff in a wacko manner, it adds a bunch of filters and whatever that
  ;; use columns from joins before adding the joins themselves (same with expressions), which is technically invalid
  ;; at the time it happens but ends up resulting in a valid query at the end of the day. Maybe one day we can rework
  ;; this code to be saner
  (binding [lib.schema/*HACK-disable-ref-validation* true]
    (if-let [element-value (some-> entity :dataset_query not-empty getter-fn)]
      (letfn [(splice-element [dashcard]
                (m/update-existing-in dashcard [:card :dataset_query] setter-fn element-value))]
        (update dashboard :dashcards (partial mapv splice-element)))
      dashboard)))

(defn- preserve-joins [dashboard entity]
  (preserve-entity-element dashboard entity lib/joins (fn [query joins]
                                                        (reduce lib/join query joins))))

(defn- preserve-expressions [dashboard entity]
  (preserve-entity-element dashboard entity lib/expressions (fn [query expressions]
                                                              (reduce
                                                               (fn [query expression]
                                                                 (lib/expression query
                                                                                 (:lib/expression-name (lib/options expression))
                                                                                 expression))
                                                               query
                                                               expressions))))

(mu/defn- query-based-analysis
  [{:keys [entity] :as root}     :- ::ads/root
   opts                          :- ::automagic-analysis.opts
   {:keys [cell-query cell-url]} :- [:maybe
                                     [:map
                                      {:closed true}
                                      [:cell-query {:optional true} [:maybe ::ads/root.cell-query]]
                                      [:cell-url   :string]]]]
  (let [transient-dash (if (table-like? entity)
                         (let [root' (merge root
                                            (when cell-query
                                              {:url                        cell-url
                                               :entity                     (:source root)
                                               :dashboard-templates-prefix ["table"]})
                                            opts)]
                           (automagic-dashboard root'))
                         (let [opts      (assoc opts :show max-cards-total)
                               root'     (merge root
                                                (when cell-query
                                                  {:url cell-url})
                                                opts)
                               base-dash (automagic-dashboard root')
                               dash      (reduce populate/merge-dashboards
                                                 base-dash
                                                 (decompose-question root entity opts))]
                           (merge dash
                                  (when cell-query
                                    (let [title (tru "A closer look at {0}" (names/cell-title root cell-query))]
                                      {:transient_name title
                                       :name           title})))))]
    (-> transient-dash
        (preserve-joins (:entity root))
        (preserve-expressions (:entity root)))))

(mu/defmethod automagic-analysis-method :model/Card
  [card
   {:keys [cell-query] :as opts} :- ::automagic-analysis.opts]
  (let [root     (->root card)
        cell-url (format "%squestion/%s/cell/%s" public-endpoint
                         (u/the-id card)
                         (magic.util/encode-base64-json cell-query))]
    (query-based-analysis root opts
                          (when cell-query
                            {:cell-query cell-query
                             :cell-url   cell-url}))))

(mu/defmethod automagic-analysis-method :model/Query
  [query
   {:keys [cell-query] :as opts} :- ::automagic-analysis.opts]
  (let [root     (->root query)
        cell-url (format "%sadhoc/%s/cell/%s" public-endpoint
                         (magic.util/encode-base64-json (:dataset_query query))
                         (magic.util/encode-base64-json cell-query))]
    ;; disable ref validation because X-Rays does stuff in a wacko manner, it adds a bunch of filters and whatever
    ;; that use columns from joins before adding the joins themselves (same with expressions), which is technically
    ;; invalid at the time it happens but ends up resulting in a valid query at the end of the day. Maybe one day we
    ;; can rework this code to be saner
    (binding [lib.schema/*HACK-disable-ref-validation* true]
      (query-based-analysis root opts
                            (when cell-query
                              {:cell-query cell-query
                               :cell-url   cell-url})))))

(mu/defmethod automagic-analysis-method :model/Field
  [field :- ::ads/field
   opts  :- ::automagic-analysis.opts]
  (automagic-dashboard (merge (->root field) opts)))

(defn- load-tables-with-enhanced-table-stats
  "Add a stats field to each provided table with the following data:
  - num-fields: The number of Fields in each table
  - list-like?: Is this field 'list like'

  Filters out tables that are link-tables"
  [clauses]
  (->>
   (t2/select [:model/Table :id :schema :display_name :entity_type :db_id
               [:ts.count :num-fields]
               [[:and
                 [:>= :ts.count 2]
                 [:= :ts.count_non_pks 1]] :list-like?]]
              {:inner-join [[{:select   [:f.table_id
                                         [:%count.* "count"]
                                         [[:count [:case [:or [:not= :semantic_type "type/PK"]
                                                          [:= :f.semantic_type nil]]
                                                   [:inline 1] :else [:inline nil]]]
                                          :count_non_pks]
                                         [[:count [:case [:in :f.semantic_type ["type/PK" "type/FK"]]
                                                   [:inline 1] :else [:inline nil]]]
                                          :count_pks_and_fks]]
                              :from     [[:metabase_field :f]]
                              :where    [:= :f.active true]
                              :group-by [:f.table_id]} :ts]
                            [:and [:= :ts.table_id :id]
                             [:> :ts.count 0]
                             [:!= :ts.count :ts.count_pks_and_fks]]]
               :where (into [:and] clauses)})
   (map #(update % :list-like? (fn [val] (if (int? val) (= val 1) val)))))) ;; handle mysql returning the predicate value as an int

(def ^:private ^:const ^Long max-candidate-tables
  "Maximal number of tables per schema shown in `candidate-tables`."
  10)

(defn candidate-tables
  "Return a list of tables in database with ID `database-id` for which it makes sense
   to generate an automagic dashboard. Results are grouped by schema and ranked
   according to interestingness (both schemas and tables within each schema). Each
   schema contains up to `max-candidate-tables` tables.

   Tables are ranked based on how specific dashboard template has been used, and
   the number of fields.
   Schemes are ranked based on the number of distinct entity types and the
   interestingness of tables they contain (see above)."
  ([database] (candidate-tables database nil))
  ([database schema]
   (let [dashboard-templates (dashboard-templates/get-dashboard-templates ["table"])]
     (->> (load-tables-with-enhanced-table-stats
           (cond-> [[:= :db_id (u/the-id database)]
                    [:= :visibility_type nil]
                    [:= :active true]]
             schema (conj [:= :schema schema])))
          (filter mi/can-read?)
          (map (fn [table]
                 (let [root      (->root table)
                       {:keys [dashboard-template-name]
                        :as   dashboard-template} (->> root
                                                       (matching-dashboard-templates dashboard-templates)
                                                       first)
                       dashboard (make-dashboard root dashboard-template)]
                   {:url                     (format "%stable/%s" public-endpoint (u/the-id table))
                    :title                   (:short-name root)
                    :score                   (+ (math/sq (:specificity dashboard-template))
                                                (math/log (:num-fields table))
                                                (if (:list-like? table)
                                                  -10
                                                  0))
                    :description             (:description dashboard)
                    :table                   table
                    :dashboard-template-name dashboard-template-name})))
          (group-by (comp :schema :table))
          (map (fn [[schema tables]]
                 (let [tables (->> tables
                                   (sort-by :score >)
                                   (take max-candidate-tables))]
                   {:id     (format "%s/%s" (u/the-id database) schema)
                    :tables tables
                    :schema schema
                    :score  (+ (math/sq (transduce (m/distinct-by :dashboard-template-name)
                                                   stats/count
                                                   tables))
                               (math/sqrt (transduce (map (comp math/sq :score))
                                                     stats/mean
                                                     tables)))})))
          (sort-by :score >)))))

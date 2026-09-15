(ns metabase.xrays.automagic-dashboards.schema
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.schema]
   [metabase.segments.schema]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::string-or-18n-string
  [:or :string [:fn {:error/message "localized string"} i18n/localized-string?]])

(mr/def ::related-keys
  "What [[metabase.xrays.related]] and the candidate-table ranking pin on an entity they return."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:24"}
   [:similarity {:optional true} [:maybe number?]]
   [:num-fields {:optional true} [:maybe :int]]
   [:list-like? {:optional true} [:maybe [:or :boolean :int]]]
   [:link       {:optional true} [:maybe ::lib.schema.id/field]]])

(mr/def ::root.entity
  [:multi
   {:dispatch t2/model}
   [:xrays/Metric  [:ref ::metric]]
   [:model/Table   [:merge :metabase.warehouse-schema.schema/table [:ref ::related-keys]]]
   [:model/Field   [:ref ::field]]
   [:model/Segment [:merge :metabase.segments.schema/segment [:ref ::related-keys]]]
   [:model/Card    [:merge :metabase.queries.schema/card [:ref ::related-keys]
                    [:map [:entity_type {:optional true} :keyword]]]]
   [:model/Query   [:ref ::adhoc-question]]])

(mr/def ::filter-clause
  [:and
   {:decode/normalize (fn [x]
                        (when (sequential? x)
                          (if (map? (second x))
                            x
                            (lib/->mbql5 x))))}
   [:ref ::lib.schema.mbql-clause/clause]
   [:ref ::lib.schema.expression/boolean]])

(mr/def ::root.cell-query
  ::filter-clause)

(mr/def ::root.cell-query-input
  "A `::root.cell-query` before [[metabase.xrays.automagic-dashboards.comparison/comparison-dashboard]] and friends
  normalize it with `(lib/normalize ::root.cell-query ...)`: a raw, possibly-legacy filter clause as callers (API
  params decoded from JSON, or a hand-written test clause) actually pass it in."
  ::lib.schema.common/possibly-unnormalized-clause)

(mr/def ::root
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:61"}
   [:database                   ::lib.schema.id/database]
   [:entity                     {:optional true} [:ref ::root.entity]]
   [:query-filter               {:optional true} [:maybe [:sequential ::filter-clause]]]
   [:cell-query                 {:optional true} [:maybe [:ref ::root.cell-query]]]
   [:full-name                  {:optional true} [:maybe ::string-or-18n-string]]
   [:short-name                 {:optional true} [:maybe ::string-or-18n-string]]
   [:comparison-name            {:optional true} [:maybe ::string-or-18n-string]]
   [:source                     {:optional true} [:maybe ::source]]
   [:url                        {:optional true} :string]
   [:dashboard-templates-prefix {:optional true} [:sequential :string]]
   [:comparison?                {:optional true} [:maybe :boolean]]
   [:rules-prefix               {:optional true} [:maybe [:sequential :string]]]
   [:dashboard-template         {:optional true} [:maybe [:sequential :string]]]
   [:show                       {:optional true} [:maybe [:or pos-int? [:= :all]]]]])

(mr/def ::source
  [:or
   (ms/InstanceOf #{:model/Table :model/Card})
   [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:80"}
    [:entity_type [:and
                   qualified-keyword?
                   [:fn
                    {:error/message ":entity/ keyword"}
                    #(= (namespace %) "entity")]]]
    [:fields {:optional true} [:sequential ::field]]]])

(mr/def ::context
  "The big ball of mud data object from which we generate x-rays"
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:90"}
   [:source       {:optional true} ::source]
   [:root         {:optional true} [:ref ::root]]
   [:tables       {:optional true} [:sequential ::source]]
   [:query-filter {:optional true} [:maybe [:sequential ::filter-clause]]]])

(mr/def ::query
  "Schema for the type of MBQL queries handled by X-Rays."
  [:ref ::lib.schema/query])

(mr/def ::adhoc-question
  "The ad-hoc \"question\" wrapper automagic-dashboards builds for a raw query that is not backed by a saved Card
  (see [[metabase.xrays.api.automagic-dashboards/adhoc-query-instance]])."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:103"}
   [:dataset_query ::query]
   [:database-id   {:optional true} ::lib.schema.id/database]
   [:table-id      {:optional true} [:maybe ::lib.schema.id/table]]
   [:entity_type   {:optional true} :keyword]])

(mr/def ::card-or-question
  "Either a Card row, or the [[::adhoc-question]] wrapper for a raw query. Several helpers in
  [[metabase.xrays.automagic-dashboards.core]] duck-type over both. Either may carry the `:entity_type`
  [[metabase.xrays.automagic-dashboards.core/source]] assoc's on."
  [:or
   [:merge :metabase.queries.schema/card [:map [:entity_type {:optional true} :keyword]]]
   ::adhoc-question])

(mr/def ::external-op
  [:merge
   ::lib.schema.common/external-op
   [:map
    [:args [:sequential
            [:multi
             {:dispatch      (fn [x] (cond (map? x) :column, (sequential? x) :aggregation, :else :literal))
              :error/message "Should be a literal, column metadata, or a nested aggregation clause"}
             [:literal     [:or ::lib.schema.literal/param-value :keyword]]
             [:column      ::lib.schema.metadata/column]
             [:aggregation [:ref ::aggregation]]]]]]])

(mr/def ::aggregation
  [:or ::lib.schema.aggregation/aggregation ::external-op])

(mr/def ::metric
  "Schema for an `:xrays/Metric`."
  [:and
   [:map
    {:closed true}
    [:name              :string]
    [:xrays/aggregation ::aggregation]
    [:table-id          {:optional true} [:maybe ::lib.schema.id/table]]
    [:xrays/database-id {:optional true} [:maybe ::lib.schema.id/database]]]
   [:fn
    {:error/message "If instance does not have :table-id, it must have :xrays/database-id"}
    (some-fn :table-id :xrays/database-id)]])

(mr/def ::field-type
  "A dimension reference, as either a semantic type or entity type and semantic type."
  [:or
   [:tuple :keyword]
   [:tuple :keyword :keyword]])

(mr/def ::dimension-value
  "A specification for the basic keys in the value of a dimension template."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:153"}
   [:field_type      ::field-type]
   [:score           {:optional true} nat-int?]
   [:max_cardinality {:optional true} nat-int?]
   [:named           {:optional true} [:string {:min 1}]]
   [:links_to        {:optional true} :keyword]])

(mr/def ::dimension-template
  "A specification for the basic keys in a dimension template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::dimension-value])

(mr/def ::metric-value
  "A specification for the basic keys in the value of a metric template."
  [:map
   {:closed true}
   [:metric ::lib.schema.common/possibly-unnormalized-clause]
   [:score  {:optional true} nat-int?]
   [:name   {:optional true} ::string-or-18n-string]])

(mr/def ::metric-template
  "A specification for the basic keys in a metric template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::metric-value])

(mr/def ::filter-value
  "A specification for the basic keys in the value of a filter template."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:184"}
   [:filter ::lib.schema.common/possibly-unnormalized-clause]
   [:score nat-int?]])

(mr/def ::filter-template
  "A specification for the basic keys in a filter template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::filter-value])

(mr/def ::item
  "A \"thing\" that we bind to: the same shape as [[::field]], a source row merged with the dimension-template and
  grounding keys that matched it."
  ::field)

(mr/def ::dim-name->dim-def
  "A map of dimension name to dimension definition."
  [:map-of :string ::dimension-value])

(mr/def ::dim-name->matching-fields
  "A map of named dimensions to a map containing the dimension data
   and a sequence of matching items satisfying this dimension"
  [:map-of
   :string
   [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:209"}
    [:matches         [:sequential ::item]]
    [:field_type      {:optional true} ::field-type]
    [:score           {:optional true} nat-int?]
    [:max_cardinality {:optional true} nat-int?]
    [:named           {:optional true} [:string {:min 1}]]
    [:links_to        {:optional true} :keyword]
    [:name            {:optional true} :string]
    [:card-score      {:optional true} number?]]])

(mr/def ::dim-name->dim-defs+matches
  "The \"full\" grounded dimensions which matches dimension names
  to the dimension definition combined with matching fields."
  ::dim-name->matching-fields)

(mr/def ::normalized-metric-template
  "A \"normalized\" metric template is a map containing the metric name as a key
   rather than a map of metric name to the map."
  [:map
   {:closed true}
   [:name        {:optional true} ::string-or-18n-string]
   [:metric-name :string]
   [:score       nat-int?]
   [:metric      ::lib.schema.common/possibly-unnormalized-clause]])

(mr/def ::grounded-metric.definition
  [:map
   {:closed true}
   [:xrays/aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
   [:xrays/breakouts    {:optional true} [:maybe [:sequential ::lib.schema.metadata/column]]]
   [:xrays/filters      {:optional true} [:maybe [:sequential ::external-op]]]])

(mr/def ::grounded-metric
  "A metric containing a definition with actual field references/ids rather than dimension references."
  [:map
   {:closed true}
   [:metric-name           :string]
   [:metric-title          :string]
   [:metric-score          nat-int?]
   [:metric-definition     ::grounded-metric.definition]
   [:id                    {:optional true} symbol?]
   [:position              {:optional true} nat-int?]
   [:dimension-name->field {:optional true} [:map-of :string ::field]]
   [:card-score            {:optional true} number?]
   [:score-components      {:optional true} [:sequential number?]]
   [:affinity-name         {:optional true} :string]
   [:total-score           {:optional true} number?]])

(mr/def ::combined-metric
  "A grounded metric in which the metric has been augmented with breakouts."
  [:merge
   ::grounded-metric
   [:map
    {:closed true}
    [:group         {:optional true} :string]
    [:card-name     {:optional true} :string]
    [:height        {:optional true} number?]
    [:width         {:optional true} number?]
    [:title         {:optional true} [:maybe ::string-or-18n-string]]
    [:visualization {:optional true} [:tuple :string ms/VisualizationSettings]]
    [:metrics       {:optional true} [:sequential :string]]
    [:filters       {:optional true} [:sequential :string]]
    [:description   {:optional true} [:maybe ::string-or-18n-string]]
    [:dimensions    {:optional true} [:sequential [:map-of :string [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:272"}
                                                                    [:aggregation {:optional true} :string]]]]]
    ;; HUH??
    [:order_by      {:optional true} [:sequential [:map-of :string [:enum "ascending" "descending"]]]]
    [:limit         {:optional true} pos-int?]
    [:x_label       {:optional true} [:maybe ::string-or-18n-string]]
    [:metric-definition
     [:merge
      ::grounded-metric.definition
      [:map
       [:xrays/breakouts [:sequential ::lib.schema.metadata/column]]]]]]])

(mr/def ::grounded-filter
  [:map
   {:closed true}
   [:score       number?]
   [:filter      ::external-op]
   [:filter-name :string]])

(mr/def ::field.xray-keys
  "What X-Rays pins on a Field while grounding it to a dimension: the matched dimension definition, the Database, the
  FK it was reached through, and the scores it ranks it by."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:294"}
   [:db                 {:optional true} [:maybe [:ref :metabase.warehouses.schema/database]]]
   [:link               {:optional true} [:maybe ::lib.schema.id/field]]
   [:aggregation        {:optional true} [:maybe :string]]
   [:field_type         {:optional true} [:maybe ::field-type]]
   [:links_to           {:optional true} [:maybe :keyword]]
   [:named              {:optional true} [:maybe :string]]
   [:max_cardinality    {:optional true} [:maybe nat-int?]]
   [:score              {:optional true} [:maybe number?]]
   [:card-score         {:optional true} [:maybe number?]]
   [:interestingness    {:optional true} [:maybe number?]]
   [:similarity         {:optional true} [:maybe number?]]
   [:xrays/database-id  {:optional true} [:maybe ::lib.schema.id/database]]])

(mr/def ::field
  "A Field X-Rays binds to a dimension: a Field row, or a Card's result metadata column wrapped as a Field, plus the
  keys grounding pins on it."
  [:multi {:dispatch (fn [field]
                       (if (contains? field :created_at) :row :result-column))}
   [:row           [:merge :metabase.warehouse-schema.schema/field [:ref ::field.xray-keys]]]
   [:result-column [:merge :metabase.legacy-mbql.schema/legacy-column-metadata [:ref ::field.xray-keys]]]])

(mr/def ::card
  "A \"card\" as it flows through the dashboard-building pipeline: the keys [[metabase.xrays.automagic-dashboards
  .populate/add-normal-dashcard]] builds it with, plus the render-stage additions
  [[metabase.xrays.automagic-dashboards.comparison/dashboard->cards]] assocs onto it."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:320"}
   [:id                     {:optional true} [:or symbol? ::lib.schema.id/card]]
   [:dataset_query          {:optional true} ::query]
   [:creator_id             {:optional true} [:maybe ::lib.schema.id/user]]
   [:description            {:optional true} [:maybe :string]]
   [:name                   {:optional true} [:maybe :string]]
   [:collection_id          {:optional true} [:maybe ::lib.schema.id/collection]]
   [:display                {:optional true} [:maybe [:or :keyword :string]]]
   [:visualization_settings {:optional true} ms/VisualizationSettings]
   [:query_type             {:optional true} [:maybe [:or :keyword :string]]]
   [:database_id            {:optional true} [:maybe ::lib.schema.id/database]]
   [:table_id               {:optional true} [:maybe ::lib.schema.id/table]]
   [:text                   {:optional true} [:maybe :string]]
   [:series                 {:optional true} [:maybe [:sequential [:ref ::card]]]]
   [:height                 {:optional true} number?]
   [:position               {:optional true} number?]])

(mr/def ::parameter-mapping
  "One entry of a dashcard's `:parameter_mappings`, as
  [[metabase.xrays.automagic-dashboards.filters/add-filter]] builds it."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:340"}
   [:parameter_id :string]
   [:target       ::lib.schema.common/possibly-unnormalized-clause]
   [:card_id      {:optional true} [:or symbol? ::lib.schema.id/card]]])

(mr/def ::dashcard
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:346"}
   [:id                     {:optional true} [:or symbol? ::lib.schema.id/dashcard]]
   [:card                   {:optional true} ::card]
   [:card_id                {:optional true} [:or symbol? ::lib.schema.id/card]]
   [:col                    {:optional true} nat-int?]
   [:row                    {:optional true} nat-int?]
   [:size_x                 {:optional true} pos-int?]
   [:size_y                 {:optional true} pos-int?]
   [:visualization_settings {:optional true} ms/VisualizationSettings]
   [:title                  {:optional true} string?]
   [:card-score             {:optional true} number?]
   [:dashboard_tab_id       {:optional true} [:maybe :int]]
   [:creator_id             {:optional true} [:maybe ::lib.schema.id/user]]
   [:series                 {:optional true} [:maybe [:sequential ::card]]]
   [:parameter_mappings     {:optional true} [:maybe [:sequential ::parameter-mapping]]]])

(mr/def ::dashboard-parameter
  "A filter widget [[metabase.xrays.automagic-dashboards.filters/add-filters]] adds to a dashboard."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:364"}
   [:id        :string]
   [:name      [:maybe :string]]
   [:slug      :string]
   [:type      :string]
   [:sectionId :string]])

(mr/def ::related-entry
  "One entry in a [[::related]] bucket: a link to another x-ray."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:373"}
   [:url         :string]
   [:title       ::string-or-18n-string]
   [:description [:maybe ::string-or-18n-string]]])

(mr/def ::related
  "The `:related` links of a populated dashboard: up to 4 buckets (which ones depend on the entity's model), each a
  list of links round-robined from candidates like segments, tables, or drilldown fields."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:381"}
   [:zoom-in  {:optional true} [:sequential ::related-entry]]
   [:zoom-out {:optional true} [:sequential ::related-entry]]
   [:related  {:optional true} [:sequential ::related-entry]]
   [:compare  {:optional true} [:sequential ::related-entry]]])

(mr/def ::dashboard
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:388"}
   [:name               {:optional true} ::string-or-18n-string]
   [:transient_name     {:optional true} [:maybe ::string-or-18n-string]]
   [:description        {:optional true} [:maybe ::string-or-18n-string]]
   [:creator_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:parameters         {:optional true} [:maybe [:sequential ::dashboard-parameter]]]
   [:dashcards          {:optional true} [:maybe [:sequential ::dashcard]]]
   [:filters            {:optional true} [:maybe [:sequential ::item]]]
   [:related            {:optional true} ::related]
   [:more               {:optional true} [:maybe :string]]
   [:transient_filters  {:optional true} [:maybe [:sequential ::filter-clause]]]
   [:param_fields       {:optional true} [:maybe [:map-of :string [:sequential ::item]]]]
   [:auto_apply_filters {:optional true} :boolean]
   [:width              {:optional true} [:enum "fixed" "full"]]])

(mr/def ::transform-card.layout
  "The section layout keys [[metabase.xrays.transforms.dashboard]] assocs onto each card it lays out."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:405"}
   [:group         :string]
   [:width         number?]
   [:height        number?]
   [:card-score    number?]
   [:position      number?]
   [:title         {:optional true} [:maybe :string]]
   [:visualization {:optional true} [:tuple [:or :keyword :string]]]
   [:text          {:optional true} [:maybe :string]]])

(mr/def ::transform-card
  "A card [[metabase.xrays.transforms.dashboard]] lays out: a saved Card, or an unsaved source-table or text card, with its section layout keys."
  [:or
   [:merge :metabase.queries.schema/card ::transform-card.layout]
   [:merge :metabase.queries.schema/card.update ::transform-card.layout]])

(mr/def ::card-template
  "A grounded, combined metric augmented with the extra keys the dashboard-populating code
  ([[metabase.xrays.automagic-dashboards.populate]]) reads off a card before rendering it, or a card a transform
  dashboard lays out. A plain text/group-heading card carries none of the metric keys, so they're all optional here."
  [:or
   [:merge
    ::combined-metric
    [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:428"}
     [:metric-name            {:optional true} :string]
     [:metric-title           {:optional true} :string]
     [:metric-score           {:optional true} nat-int?]
     [:metric-definition      {:optional true} ::grounded-metric.definition]
     [:dataset_query          {:optional true} ::query]
     [:y_label                {:optional true} :string]
     [:series_labels          {:optional true} [:sequential :string]]
     [:text                   {:optional true} :string]
     [:visualization-settings {:optional true} ms/VisualizationSettings]]]
   ::transform-card])

(mr/def ::dashboard-template
  "This is somewhat different [[metabase.xrays.automagic-dashboards.schema/DashboardTemplate]], I haven't exactly worked
  out what the schema is supposed to be yet."
  [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:443"}
   [:cards           {:optional true} [:maybe [:sequential ::card-template]]]
   [:title           {:optional true} [:maybe ::string-or-18n-string]]
   [:transient_title {:optional true} [:maybe ::string-or-18n-string]]
   [:description     {:optional true} [:maybe ::string-or-18n-string]]
   [:filters         {:optional true} [:sequential ::item]]
   [:groups          {:optional true} [:maybe [:map-of :string [:map {:closed true, :probe/id "src/metabase/xrays/automagic_dashboards/schema.clj:449"}
                                                                [:title             {:optional true} ::string-or-18n-string]
                                                                [:score             {:optional true} :int]
                                                                [:comparison_title  {:optional true} [:maybe ::string-or-18n-string]]
                                                                [:description       {:optional true} [:maybe ::string-or-18n-string]]]]]]])

(mr/def ::grounded-values
  [:map
   {:closed true}
   [:dimensions {:optional true} ::dim-name->matching-fields]
   [:metrics    {:optional true} [:sequential ::grounded-metric]]
   [:filters    {:optional true} [:sequential ::grounded-filter]]])

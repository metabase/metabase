(ns metabase.describe.api
  "`/api/describe/` routes.

  Deterministic (non-LLM) natural-language descriptions derived from an entity's MBQL. Given an entity type and id,
  returns the Lib `suggested-name` for the whole query plus a per-stage-section breakdown (aggregation, breakout,
  filters, ...). This is the same describe machinery the UI and the metric-card `:query_description` already use, so
  output stays consistent with what users see.

  Only MBQL-bearing entity types are supported: cards (questions/models/metrics), segments, and measures. Native
  queries yield `:native true` with a `nil` `:suggested_name`, which is expected, not an error."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private describable-models
  "Entity types this endpoint can describe. All carry MBQL we can route through Lib."
  ["card" "segment" "measure"])

(def ^:private described-keys
  "Stage `top-level-key`s we surface, paired with their JSON-friendly response keys. Order is the order they appear in
  a query summary."
  [[:aggregation :aggregation]
   [:breakout    :breakout]
   [:filters     :filters]
   [:order-by    :order_by]
   [:limit       :limit]
   [:joins       :joins]])

(def ^:private Sections
  (into [:map {:closed true}]
        (for [[_ out-k] described-keys]
          [out-k [:maybe :string]])))

(def ^:private DescribeResponse
  [:map
   [:model          [:enum "card" "segment" "measure"]]
   [:id             ms/PositiveInt]
   [:name           [:maybe :string]]
   ;; Whole-query summary, e.g. "Orders, Sum of Total, Grouped by Category". `nil` for native queries.
   [:suggested_name [:maybe :string]]
   [:native         :boolean]
   [:sections       Sections]])

(defn- describe-key
  "Describe one stage section of `query`, swallowing the describe machinery's coverage-gap exceptions."
  [query top-level-key]
  (try
    (lib/describe-top-level-key query top-level-key)
    (catch Throwable _ nil)))

(defn- query-nl
  "Composite natural-language derivation for a Lib `query`."
  [query]
  {:suggested_name (try (lib/suggested-name query) (catch Throwable _ nil))
   :native         (boolean (try (lib/native? query) (catch Throwable _ false)))
   :sections       (into {} (for [[k out-k] described-keys]
                              [out-k (describe-key query k)]))})

(def ^:private empty-nl
  "Result shape for an entity with no describable query (e.g. a measure/segment with a blank definition)."
  {:suggested_name nil
   :native         false
   :sections       (into {} (for [[_ out-k] described-keys] [out-k nil]))})

(defn- card->query
  "Build a Lib query for `card`, or `nil` when it has no query to describe. Mirrors the metric-card
  `:query_description` path in `metabase.queries.models.card`."
  [card]
  (when (and (seq (:dataset_query card)) (:database_id card))
    (-> (lib-be/application-database-metadata-provider (:database_id card))
        (lib/query (:dataset_query card)))))

(defn- read-entity+query
  "Read-check the entity (404/403 on failure) and return `[entity lib-query-or-nil]`."
  [model id]
  (case model
    "card"    (let [card (api/read-check :model/Card id)]    [card (card->query card)])
    ;; Segment/Measure `:definition` is normalized to a full Lib query (with metadata provider) on select, so it can be
    ;; fed to the describe machinery directly.
    "segment" (let [seg (api/read-check :model/Segment id)]  [seg (:definition seg)])
    "measure" (let [m (api/read-check :model/Measure id)]    [m (:definition m)])))

(api.macros/defendpoint :get "/:model/:id" :- DescribeResponse
  "Return deterministic natural-language data derived from an entity's MBQL.

  `model` is one of `card`, `segment`, `measure`. Returns the whole-query `suggested_name` and a per-section
  breakdown. Requires read permission on the entity."
  [{:keys [model id]} :- [:map
                          [:model (into [:enum] describable-models)]
                          [:id    ms/PositiveInt]]]
  (let [[entity query] (read-entity+query model id)]
    (merge {:model model
            :id    id
            :name  (:name entity)}
           (if query
             (query-nl query)
             empty-nl))))

(ns metabase.viz-eval.api
  "Superuser-only endpoints backing the internal default-visualization A/B evaluation page (`/_internal/viz-ab`):
  pick a random Card to judge, describe the projection of a native Card's SQL (via sqlglot) enriched with Field
  metadata, and store the judgements. Judgements live in a `viz_eval_judgement` table that is created lazily, so this
  prototype needs no migration."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.sqlglot.core :as sqlglot]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- judgements ---------------------------------------------------

(defn- create-table-query []
  (let [columns (case (mdb/db-type)
                  :postgres [[:id :serial [:primary-key]]
                             [:card_id :integer]
                             [:content :text [:not nil]]]
                  :mysql    [[:id :bigint [:primary-key] [:auto-increment]]
                             [:card_id :integer]
                             [:content :text [:not nil]]]
                  :h2       [[:id :identity [:primary-key]]
                             [:card_id :integer]
                             [:content :text [:not nil]]])]
    (-> (sql.helpers/create-table :viz_eval_judgement :if-not-exists)
        (sql.helpers/with-columns columns))))

(def ^:private judgement-table
  (mdb/memoize-for-application-db
   (fn []
     (log/info "Creating viz_eval_judgement table if it does not exist")
     (t2/query (create-table-query))
     :viz_eval_judgement)))

(defn- row->judgement [row]
  (assoc (json/decode+kw (:content row)) :id (:id row)))

(api.macros/defendpoint :get "/judgements" :- [:sequential :map]
  "All stored judgements, oldest first."
  []
  (api/check-superuser)
  (mapv row->judgement (t2/query {:select   [:id :content]
                                  :from     [(judgement-table)]
                                  :order-by [[:id :asc]]})))

(api.macros/defendpoint :post "/judgements" :- :map
  "Store a judgement. The body is kept as-is (JSON), plus `card_id` as a column for the random-card exclusion."
  [_route-params
   _query-params
   body :- [:map-of :keyword :any]]
  (api/check-superuser)
  (let [id (t2/insert-returning-pk! (judgement-table)
                                    {:card_id (:card_id body)
                                     :content (json/encode body)})]
    (assoc body :id id)))

(defn- judged-card-ids []
  (into #{}
        (keep :card_id)
        (t2/query {:select [:card_id]
                   :from   [(judgement-table)]})))

;;; ------------------------------------------------- random card ---------------------------------------------------

(defn- random-order-by
  "A random `:order-by` clause, using the application database's native random function."
  []
  [[[(case (mdb/db-type)
       :postgres :random
       :rand)]]])

(defn- eligible-cards-where
  [database-id query-type excluded-ids]
  (cond-> [:and
           [:= :archived false]
           [:= :type "question"]]
    database-id        (conj [:= :database_id database-id])
    query-type         (conj [:= :query_type query-type])
    (seq excluded-ids) (conj [:not-in :id excluded-ids])))

(api.macros/defendpoint :get "/random-card" :- [:map
                                                [:id        ms/PositiveInt]
                                                [:remaining ms/IntGreaterThanOrEqualToZero]]
  "A random unarchived question Card to judge, optionally restricted to a database and/or query type, skipping Cards
  that already have a judgement unless `exclude_judged` is false. `remaining` is the number of eligible Cards."
  [_route-params
   {:keys [database_id query_type exclude_judged]}
   :- [:map
       [:database_id    {:optional true} [:maybe ms/PositiveInt]]
       [:query_type     {:optional true} [:maybe [:enum "native" "query"]]]
       [:exclude_judged {:default true} [:maybe ms/BooleanValue]]]]
  (api/check-superuser)
  (let [where     (eligible-cards-where database_id query_type (when exclude_judged (judged-card-ids)))
        remaining (t2/count :model/Card {:where where})
        card      (api/check-404 (t2/select-one [:model/Card :id]
                                                {:where    where
                                                 :order-by (random-order-by)
                                                 :limit    1}))]
    {:id        (:id card)
     :remaining remaining}))

;;; ----------------------------------------------- native structure ------------------------------------------------

(defn- raw-native-sql
  "The SQL of a native Card as written, with `{{template tags}}` replaced by `NULL` so it still parses."
  [card]
  (let [dataset-query (:dataset_query card)
        sql           (or (get-in dataset-query [:native :query])
                          (get-in dataset-query [:stages 0 :native]))]
    (some-> sql (str/replace #"\{\{[^}]*\}\}" "NULL"))))

(defn- card-sql
  "The SQL the Card would actually run (parameters inlined), falling back to [[raw-native-sql]] when compiling fails
  (e.g. a required template tag has no default)."
  [card]
  (try
    (:query (qp.compile/compile-with-inline-parameters (qp.card/query-for-card card [] nil nil)))
    (catch Throwable e
      (log/warnf e "Could not compile Card %d; falling back to its raw SQL" (:id card))
      (raw-native-sql card))))

(def ^:private field-metadata-keys
  [:semantic_type :effective_type :base_type :fingerprint :has_field_values :visibility_type :preview_display
   :dimension_interestingness :database_is_pk])

(defn- resolve-field
  "The `:model/Field` in `database-id` named by a sqlglot `source_column` (case-insensitive on schema, table, and
  column), or nil."
  [database-id {:keys [table schema column]}]
  (when (and table column)
    (when-let [table-ids (seq (t2/select-pks-set :model/Table
                                                 {:where (cond-> [:and
                                                                  [:= :db_id database-id]
                                                                  [:= [:lower :name] (u/lower-case-en table)]]
                                                           schema (conj [:= [:lower :schema] (u/lower-case-en schema)]))}))]
      (t2/select-one :model/Field
                     {:where [:and
                              [:in :table_id table-ids]
                              [:= [:lower :name] (u/lower-case-en column)]]}))))

(defn- result-metadata-column
  [card item-name]
  (let [item-name (u/lower-case-en item-name)]
    (some (fn [{col-name :name, :as col}]
            (when (and col-name (= (u/lower-case-en col-name) item-name))
              col))
          (:result_metadata card))))

(defn- enrich-item
  "Merge Field metadata into a `select-structure` item: from the resolved `:model/Field` when the item's source
  column maps to one, otherwise the Card's result metadata types plus a semantic type inferred from the name."
  [card item]
  (if-let [field (some->> (:source_column item) (resolve-field (:database_id card)))]
    (merge item (select-keys field field-metadata-keys))
    (let [{:keys [base_type effective_type]} (result-metadata-column card (:name item))]
      (cond-> item
        base_type (assoc :base_type      base_type
                         :effective_type (or effective_type base_type)
                         :semantic_type  (analyze/infer-semantic-type-by-name {:name      (:name item)
                                                                               :base_type base_type}))))))

(api.macros/defendpoint :post "/native-structure" :- [:map
                                                      [:aggregated :boolean]
                                                      [:kind       [:enum "select" "union" "other"]]
                                                      [:items      [:sequential :map]]
                                                      [:error      {:optional true} :string]
                                                      [:timing_ms  {:optional true} number?]]
  "The projection structure of a native Card's SQL (see [[metabase.sql-parsing.core/select-structure]]), with each
  item enriched with Field metadata, plus the parse time in `timing_ms`."
  [_route-params
   _query-params
   {:keys [card_id]} :- [:map [:card_id ms/PositiveInt]]]
  (api/check-superuser)
  (let [card (api/read-check :model/Card card_id)]
    (if (not= :native (:query_type card))
      {:aggregated false :kind "other" :items [] :error "not-native"}
      (let [sql       (card-sql card)
            dialect   (sqlglot/driver->dialect (:engine (t2/select-one :model/Database :id (:database_id card))))
            start     (System/nanoTime)
            result    (sql-parsing/select-structure dialect (or sql ""))
            timing-ms (/ (- (System/nanoTime) start) 1e6)]
        (-> result
            (update :items #(mapv (partial enrich-item card) %))
            (assoc :timing_ms timing-ms))))))

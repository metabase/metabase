(ns metabase-enterprise.metabot-v3.dummy-tools
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(defn get-current-user
  "Get information about the current user."
  []
  (if-let [{:keys [id email first_name last_name]}
           (or (some-> api/*current-user* deref)
               (t2/select-one [:model/User :id :email :first_name :last_name] api/*current-user-id*))]
    {:structured-output {:id id
                         :type :user
                         :name (str first_name " " last_name)
                         :email-address email}}
    {:output "current user not found"}))

(defn get-dashboard-details
  "Get information about the dashboard with ID `dashboard-id`."
  [{:keys [dashboard-id]}]
  (if-let [dashboard (t2/select-one [:model/Dashboard :id :description :name :collection_id] dashboard-id)]
    (do (api/read-check dashboard)
        {:structured-output (-> dashboard (dissoc :collection_id) (assoc :type :dashboard))})
    {:output "dashboard not found"}))

(defn- get-field-values [id->values id]
  (->
   (get id->values id)
   (or (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id id)))
   :values))

(defn- add-field-values
  [cols]
  (if-let [field-ids (seq (keep :id cols))]
    (let [id->values (field-values/batched-get-latest-full-field-values field-ids)]
      (map #(m/assoc-some % :field-values (some->> % :id (get-field-values id->values))) cols))
    cols))

(defn- add-table-reference
  [query col]
  (cond-> col
    (and (:fk-field-id col)
         (:table-id col))
    (assoc :table-reference (-> (lib/display-name query (lib.metadata/field query (:fk-field-id col)))
                                lib.util/strip-id))))

(defn metric-details
  "Get metric details as returned by tools."
  ([id] (metric-details id nil))
  ([id options]
   (when-let [card (metabot-v3.tools.u/get-card id)]
     (metric-details card (lib.metadata.jvm/application-database-metadata-provider (:database_id card)) options)))
  ([card metadata-provider {:keys [field-values-fn with-default-temporal-breakout? with-queryable-dimensions?]
                            :or   {field-values-fn                 add-field-values
                                   with-default-temporal-breakout? true
                                   with-queryable-dimensions?      true}}]
   (let [id (:id card)
         query-needed? (or with-default-temporal-breakout? with-queryable-dimensions?)
         metric-query (when query-needed?
                        (lib/query metadata-provider (lib.metadata/card metadata-provider id)))
         breakouts (when query-needed?
                     (lib/breakouts metric-query))
         base-query (when query-needed?
                      (lib/remove-all-breakouts metric-query))
         visible-cols (when query-needed?
                        (->> (lib/visible-columns base-query)
                             (map #(add-table-reference base-query %))))
         col->index (when query-needed?
                      (into {} (map-indexed (fn [i col] [col i])) visible-cols))
         col-index (when query-needed?
                     #(-> % (dissoc :operators :field-values) col->index))
         default-temporal-breakout (when with-default-temporal-breakout?
                                     (->> breakouts
                                          (map #(lib/find-matching-column % visible-cols))
                                          (m/find-first lib.types.isa/temporal?)))
         field-id-prefix (metabot-v3.tools.u/card-field-id-prefix id)]
     (cond-> {:id id
              :type :metric
              :name (:name card)
              :description (:description card)
              :default-time-dimension-field-id (when default-temporal-breakout
                                                 (-> (metabot-v3.tools.u/->result-column
                                                      metric-query
                                                      default-temporal-breakout
                                                      (col-index default-temporal-breakout)
                                                      field-id-prefix)
                                                     :field-id))}
       with-queryable-dimensions?
       (assoc :queryable-dimensions (into []
                                          (comp (map #(add-table-reference base-query %))
                                                (map #(metabot-v3.tools.u/->result-column
                                                       metric-query % (col-index %) field-id-prefix)))
                                          (->> (lib/filterable-columns base-query)
                                               field-values-fn)))))))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (metric-details 135))
  -)

(defn- convert-metric
  ([db-metric metadata-provider]
   (convert-metric db-metric metadata-provider nil))
  ([db-metric metadata-provider options]
   (-> db-metric
       (metric-details metadata-provider (assoc options :with-queryable-dimensions? false))
       (select-keys  [:id :type :name :description :default-time-dimension-field-id]))))

(defn- table-details
  ([id] (table-details id nil))
  ([id {:keys [metadata-provider field-values-fn with-fields? with-metrics?]
        :or   {field-values-fn add-field-values
               with-fields?    true
               with-metrics?   true}
        :as   options}]
   (when-let [base (if metadata-provider
                     (lib.metadata/table metadata-provider id)
                     (metabot-v3.tools.u/get-table id :db_id :description :name))]
     (let [query-needed? (or with-fields? with-metrics?)
           mp (when query-needed?
                (or metadata-provider
                    (lib.metadata.jvm/application-database-metadata-provider (:db_id base))))
           table-query (when query-needed?
                         (lib/query mp (lib.metadata/table mp id)))
           cols (when with-fields?
                  (->> (lib/visible-columns table-query)
                       field-values-fn
                       (map #(add-table-reference table-query %))))
           field-id-prefix (when with-fields?
                             (metabot-v3.tools.u/table-field-id-prefix id))]
       (-> {:id id
            :type :table
            :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column table-query %2 %1 field-id-prefix)) cols)
            ;; :name should be (lib/display-name table-query), but we want to avoid creating the query if possible
            :name (some->> (:name base)
                           (u.humanization/name->human-readable-name :simple))}
           (m/assoc-some :description (:description base)
                         :metrics (when with-metrics?
                                    (not-empty (mapv #(convert-metric % mp options)
                                                     (lib/available-metrics table-query))))))))))

(defn- card-details
  "Get details for a card."
  ([id] (card-details id nil))
  ([id options]
   (when-let [card (metabot-v3.tools.u/get-card id)]
     (card-details card (lib.metadata.jvm/application-database-metadata-provider (:database_id card)) options)))
  ([base metadata-provider {:keys [field-values-fn with-fields? with-metrics?]
                            :or   {field-values-fn add-field-values
                                   with-fields?    true
                                   with-metrics?   true}
                            :as   options}]
   (let [id (:id base)
         query-needed? (or with-fields? with-metrics?)
         card-metadata (when query-needed?
                         (lib.metadata/card metadata-provider id))
         dataset-query (when query-needed?
                         (get card-metadata :dataset-query))
         ;; pivot questions have strange result-columns so we work with the dataset-query
         card-type (:type base)
         card-query (when query-needed?
                      (lib/query metadata-provider (if (and (#{:question} card-type)
                                                            (#{:pivot} (:display base))
                                                            (#{:query} (:type dataset-query)))
                                                     dataset-query
                                                     card-metadata)))
         cols (when with-fields?
                (->> (lib/visible-columns card-query)
                     field-values-fn
                     (map #(add-table-reference card-query %))))
         field-id-prefix (metabot-v3.tools.u/card-field-id-prefix id)]
     (-> {:id id
          :type card-type
          :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column card-query %2 %1 field-id-prefix)) cols)
          :name (:name base)
          :queryable-foreign-key-tables []}
         (m/assoc-some :description (:description base)
                       :metrics (when with-metrics?
                                  (not-empty (mapv #(convert-metric % metadata-provider options)
                                                   (lib/available-metrics card-query)))))))))

(defn cards-details
  "Get the details of metrics or models as specified by `card-type` and `cards`
  from the database with ID `database-id` respecting `options`."
  [card-type database-id cards options]
  (let [mp (lib.metadata.jvm/application-database-metadata-provider database-id)
        detail-fn (case card-type
                    :metric metric-details
                    :model card-details)]
    (lib.metadata/bulk-metadata mp :metadata/card (map :id cards))
    (map #(-> (detail-fn % mp (u/assoc-default options :field-values-fn identity))
              (assoc :type card-type))
         cards)))

(defn answer-sources
  "Get the details of metrics and models in the scope of the Metabot instance with ID `metabot-id`."
  ([metabot-id]
   (answer-sources metabot-id nil))
  ([metabot-id options]
   (lib.metadata.jvm/with-metadata-provider-cache
     (let [metrics-and-models (metabot-v3.tools.u/get-metrics-and-models metabot-id)
           {metrics :metric, models :model}
           (->> (for [[[card-type database-id] cards] (group-by (juxt :type :database_id) metrics-and-models)
                      detail (cards-details card-type database-id cards options)]
                  detail)
                (group-by :type))]
       {:structured-output {:metrics (vec metrics)
                            :models  (vec models)}}))))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    #_(table-details 30 nil)
    (card-details 110)
    #_(metric-details 108)
    #_(dev.toucan2-monitor/with-queries [queries]
        (u/prog1 (answer-sources "__METABOT__"
                                 {:with-fields?                    false
                                  :with-metrics?                   true
                                  :with-default-temporal-breakout? false
                                  :with-queryable-dimensions?      false})
          (tap> (queries)))))
  -)

(defn get-table-details
  "Get information about the table or model with ID `table-id`.
  `table-id` is string either encoding an integer that is the ID of a table
  or a string containing the prefix card__ and the ID of a model (card) as suffix.
  Alternatively, `table-id` can be an integer ID of a table.
  `model-id` is an integer ID of a model (card). Exactly one of `table-id` or `model-id`
  should be supplied."
  [{:keys [model-id table-id] :as arguments}]
  (lib.metadata.jvm/with-metadata-provider-cache
    (let [options (cond-> arguments
                    (= (:with-field-values? arguments) false) (assoc :field-values-fn identity))
          details (cond
                    (int? model-id)    (card-details model-id options)
                    (int? table-id)    (table-details table-id options)
                    (string? table-id) (if-let [[_ card-id] (re-matches #"card__(\d+)" table-id)]
                                         (card-details (parse-long card-id) options)
                                         (if (re-matches #"\d+" table-id)
                                           (table-details (parse-long table-id) options)
                                           "invalid table_id"))
                    :else "invalid arguments")]
      (if (map? details)
        {:structured-output details}
        {:output (or details "table not found")}))))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (let [id #_"card__137" #_"card__136" #_27 "27"]
      (get-table-details {:table-id id})))
  -)

(defn get-metric-details
  "Get information about the metric with ID `metric-id`."
  [{:keys [metric-id] :as arguments}]
  (lib.metadata.jvm/with-metadata-provider-cache
    (let [options (cond-> arguments
                    (= (:with-field-values? arguments) false) (assoc :field-values-fn identity))
          details (if (int? metric-id)
                    (metric-details metric-id options)
                    "invalid metric_id")]
      (if (map? details)
        {:structured-output details}
        {:output (or details "metric not found")}))))

(defn get-report-details
  "Get information about the report (card) with ID `report-id`."
  [{:keys [report-id] :as arguments}]
  (lib.metadata.jvm/with-metadata-provider-cache
    (let [options (cond-> arguments
                    (= (:with-field-values? arguments) false) (assoc :field-values-fn identity))
          details (if (int? report-id)
                    (let [details (card-details report-id options)]
                      (some-> details
                              (select-keys [:id :type :description :name])
                              (assoc :result-columns (:fields details))))
                    "invalid report_id")]
      (if (map? details)
        {:structured-output details}
        {:output (or details "report not found")}))))

(defn- execute-query
  [query-id legacy-query]
  (let [legacy-query (mbql.normalize/normalize legacy-query)
        field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        database-id (:database legacy-query)
        _ (api/read-check :model/Database database-id)
        mp (lib.metadata.jvm/application-database-metadata-provider database-id)
        query (lib/query mp legacy-query)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query-id query-id
     :query legacy-query
     :result-columns (into []
                           (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 field-id-prefix))
                           returned-cols)}))

(defn get-query-details
  "Get the details of a (legacy) query."
  [{:keys [query]}]
  (lib.metadata.jvm/with-metadata-provider-cache
    {:structured-output (execute-query (u/generate-nano-id) query)}))

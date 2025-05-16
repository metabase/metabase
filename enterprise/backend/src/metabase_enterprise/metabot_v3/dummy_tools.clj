(ns metabase-enterprise.metabot-v3.dummy-tools
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.models.field-values :as field-values]
   [metabase.util :as u]
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

(defn- add-field-values
  [cols]
  (if-let [field-ids (seq (keep :id cols))]
    (let [id->values (field-values/batched-get-latest-full-field-values field-ids)]
      (map #(m/assoc-some % :field-values (-> % :id id->values :values)) cols))
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
  ([id]
   (when-let [card (metabot-v3.tools.u/get-card id)]
     (metric-details card (lib.metadata.jvm/application-database-metadata-provider (:database_id card)))))
  ([card metadata-provider]
   (metric-details card metadata-provider nil))
  ([card metadata-provider {:keys [field-values-fn] :or {field-values-fn add-field-values}}]
   (let [id (:id card)
         metric-query (lib/query metadata-provider (lib.metadata/card metadata-provider id))
         breakouts (lib/breakouts metric-query)
         base-query (lib/remove-all-breakouts metric-query)
         visible-cols (->> (lib/visible-columns base-query)
                           (map #(add-table-reference base-query %)))
         filterable-cols (->> (lib/filterable-columns base-query)
                              field-values-fn
                              (map #(add-table-reference base-query %)))
         default-temporal-breakout (->> breakouts
                                        (map #(lib/find-matching-column % visible-cols))
                                        (m/find-first lib.types.isa/temporal?))
         field-id-prefix (metabot-v3.tools.u/card-field-id-prefix id)]
     {:id id
      :type :metric
      :name (:name card)
      :description (:description card)
      :default-time-dimension-field-id (when default-temporal-breakout
                                         (-> (metabot-v3.tools.u/->result-column
                                              metric-query default-temporal-breakout visible-cols field-id-prefix)
                                             :field-id))
      :queryable-dimensions (mapv #(metabot-v3.tools.u/->result-column metric-query % visible-cols field-id-prefix)
                                  filterable-cols)})))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (metric-details 135))
  -)

(defn- convert-metric
  [db-metric metadata-provider]
  (-> db-metric (metric-details metadata-provider)
      (select-keys  [:id :type :name :description :default-time-dimension-field-id])))

(defn- table-details
  ([id] (table-details id nil))
  ([id {:keys [metadata-provider]}]
   (when-let [base (if metadata-provider
                     (lib.metadata/table metadata-provider id)
                     (metabot-v3.tools.u/get-table id :db_id :description))]
     (let [mp (or metadata-provider
                  (lib.metadata.jvm/application-database-metadata-provider (:db_id base)))
           table-query (lib/query mp (lib.metadata/table mp id))
           cols (->> (lib/visible-columns table-query)
                     add-field-values
                     (map #(add-table-reference table-query %)))
           field-id-prefix (metabot-v3.tools.u/table-field-id-prefix id)]
       (-> {:id id
            :type :table
            :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column table-query %2 %1 field-id-prefix)) cols)
            :name (lib/display-name table-query)}
           (m/assoc-some :description (:description base)
                         :metrics (not-empty (mapv #(convert-metric % mp) (lib/available-metrics table-query)))))))))

(defn- card-details
  "Get details for a card."
  ([id]
   (when-let [card (metabot-v3.tools.u/get-card id)]
     (card-details card (lib.metadata.jvm/application-database-metadata-provider (:database_id card)))))
  ([base metadata-provider]
   (card-details base metadata-provider nil))
  ([base metadata-provider {:keys [field-values-fn] :or {field-values-fn add-field-values}}]
   (let [id (:id base)
         card-metadata (lib.metadata/card metadata-provider id)
         dataset-query (get card-metadata :dataset-query)
         ;; pivot questions have strange result-columns so we work with the dataset-query
         card-type (:type base)
         card-query (lib/query metadata-provider (if (and (#{:question} card-type)
                                                          (#{:pivot} (:display base))
                                                          (#{:query} (:type dataset-query)))
                                                   dataset-query
                                                   card-metadata))
         cols (->> (lib/visible-columns card-query)
                   field-values-fn
                   (map #(add-table-reference card-query %)))
         field-id-prefix (metabot-v3.tools.u/card-field-id-prefix id)]
     (-> {:id id
          :type card-type
          :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column card-query %2 %1 field-id-prefix)) cols)
          :name (lib/display-name card-query)
          :queryable-foreign-key-tables []}
         (m/assoc-some :description (:description base)
                       :metrics (not-empty (mapv #(convert-metric % metadata-provider) (lib/available-metrics card-query))))))))

(defn- cards-details
  [card-type database-id cards]
  (let [mp (lib.metadata.jvm/application-database-metadata-provider database-id)
        detail-fn (case card-type
                    :metric metric-details
                    :model card-details)]
    (lib.metadata/bulk-metadata mp :metadata/card (map :id cards))
    (map #(-> % (detail-fn mp {:field-values-fn identity}) (assoc :type card-type)) cards)))

(defn answer-sources
  "Get the details metrics and models from the collection with name `collection-name`."
  [metabot-collection]
  (let [metrics-and-models (metabot-v3.tools.u/get-metrics-and-models metabot-collection)
        {metrics :metric, models :model}
        (->> (for [[[card-type database-id] cards] (group-by (juxt :type :database_id) metrics-and-models)
                   detail (cards-details card-type database-id cards)]
               detail)
             (group-by :type))]
    {:structured-output {:metrics (vec metrics)
                         :models  (vec models)}}))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    #_(table-details 30 nil)
    (card-details 110)
    #_(metric-details 108)
    #_(answer-sources "__METABOT__"))
  -)

(defn get-table-details
  "Get information about the table or model with ID `table-id`.
  `table-id` is string either encoding an integer that is the ID of a table
  or a string containing the prefix card__ and the ID of a model (card) as suffix.
  Alternatively, `table-id` can be an integer ID of a table.
  `model-id` is an integer ID of a model (card). Exactly one of `table-id` or `model-id`
  should be supplied."
  [{:keys [model-id table-id]}]
  (let [details (cond
                  (int? model-id) (card-details model-id)
                  (int? table-id) (table-details table-id)
                  (string? table-id) (if-let [[_ card-id] (re-matches #"card__(\d+)" table-id)]
                                       (card-details (parse-long card-id))
                                       (if (re-matches #"\d+" table-id)
                                         (table-details (parse-long table-id))
                                         "invalid table_id"))
                  :else "invalid arguments")]
    (if (map? details)
      {:structured-output details}
      {:output (or details "table not found")})))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (let [id #_"card__137" #_"card__136" #_27 "27"]
      (get-table-details {:table-id id})))
  -)

(defn get-metric-details
  "Get information about the metric with ID `metric-id`."
  [{:keys [metric-id]}]
  (let [details (if (int? metric-id)
                  (metric-details metric-id)
                  "invalid metric_id")]
    (if (map? details)
      {:structured-output details}
      {:output (or details "metric not found")})))

(defn get-report-details
  "Get information about the report (card) with ID `report-id`."
  [{:keys [report-id]}]
  (let [details (if (int? report-id)
                  (let [details (card-details report-id)]
                    (some-> details
                            (select-keys [:id :type :description :name])
                            (assoc :result-columns (:fields details))))
                  "invalid report_id")]
    (if (map? details)
      {:structured-output details}
      {:output (or details "report not found")})))

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
  {:structured-output (execute-query (u/generate-nano-id) query)})

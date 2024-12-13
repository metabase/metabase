(ns metabase-enterprise.metabot-v3.dummy-tools
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.query]
   [metabase-enterprise.metabot-v3.tools.who-is-your-favorite]
   [metabase.api.common :as api]
   [metabase.api.table :as api.table]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- get-current-user
  [_ _ context]
  {:output (if-let [{:keys [id email first_name last_name]}
                    (or (some-> api/*current-user* deref)
                        (t2/select-one [:model/User :id :email :first_name :last_name] api/*current-user-id*))]
             {:id id
              :name (str first_name " " last_name)
              :email_address email}
             {:error "current user not found"})
   :context context})

(defn- get-dashboard-details
  [_ {:keys [dashboard_id]} context]
  {:output (or (t2/select-one [:model/Dashboard :id :description :name] dashboard_id)
               {:error "dashboard not found"})
   :context context})

(defn- convert-field-type
  [db-field]
  (let [db-field (u/normalize-map db-field)]
    (cond
      (lib.types.isa/boolean? db-field)               "boolean"
      (lib.types.isa/string-or-string-like? db-field) "string"
      (lib.types.isa/numeric? db-field)               "number"
      (lib.types.isa/temporal? db-field)              "date")))

(defn- convert-field
  [db-field]
  (-> db-field
      (select-keys [:id :name :description])
      (update :id #(str "field_" %))
      (assoc :type (convert-field-type db-field))))

(defn- convert-metric
  [db-metric]
  (select-keys db-metric [:id :name :description]))

(declare ^:private table-details)

(defn- foreign-key-tables
  [fields]
  (when-let [target-field-ids (->> fields
                                   (into #{} (keep :fk_target_field_id))
                                   not-empty)]
    (->> (t2/select-fn-set :table_id :model/Field :id [:in target-field-ids])
         (into [] (keep #(table-details % {:include-foreign-key-tables? false})))
         not-empty)))

(defn- table-details
  "Loads the details of a table with ID `id`. If the option `include-foreign-key-tables?` is truthy,
  the details of tables referred to by foreign keys are also loaded. Does N+1 DB queries."
  [id {:keys [include-foreign-key-tables?]}]
  (let [table (t2/select-one [:model/Table :id :name :description] id)
        base (when (mi/can-read? table)
               (-> table
                   (t2/hydrate :fields :metrics)
                   (assoc :id id)))
        fields (remove (comp #{:hidden :sensitive} :visibility_type) (:fields base))]
    (some-> base
            (assoc :fields (mapv convert-field fields))
            (update :metrics #(mapv convert-metric %))
            (cond-> include-foreign-key-tables? (assoc :queryable_foreign_key_tables (foreign-key-tables fields))))))

(defn- card-details
  [id]
  (let [base (first (api.table/batch-fetch-card-query-metadatas [id]))
        fields (remove (comp #{:hidden :sensitive} :visibility_type) (:fields base))]
    (some-> base
            (select-keys [:id :description])
            (assoc :fields (mapv convert-field fields)
                   :name (:display_name base))
            (update :metrics #(mapv convert-metric %))
            (assoc :queryable_foreign_key_tables (foreign-key-tables fields)))))

(defn- get-table-details
  [_ {:keys [table_id]} context]
  (let [details (if-let [[_ card-id] (re-matches #"card__(\d+)" table_id)]
                  (card-details (parse-long card-id))
                  (table-details (parse-long table_id) {:include-foreign-key-tables? true}))]
    {:output (or details
                 "table not found")
     :context context}))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (let [id "card__137" #_"card__136" #_"27"]
      (get-table-details :get-table-details {:table_id id} {})))
  -)

(defn- dummy-tool-messages
  [tool-id arguments content]
  (let [call-id (random-uuid)]
    [{:content    nil
      :role       :assistant,
      :tool_calls [{:id        call-id
                    :name      tool-id
                    :arguments (json/generate-string arguments)}]}

     {:content      (json/generate-string content)
      :role         :tool,
      :tool_call_id call-id}]))

(defn- dummy-get-current-user
  [context]
  (let [content (:output (get-current-user :get-current-user {} context))]
    (dummy-tool-messages :get-current-user {} content)))

(def ^:private detail-getters
  {:dashboard {:id :get-dashboard-details
               :fn get-dashboard-details
               :id-name :dashboard_id}
   :table {:id :get-table-details
           :fn (fn [tool-id args context]
                 (get-table-details tool-id (update args :table_id str) context))
           :id-name :table_id}
   :model {:id :get-table-details
           :fn (fn [tool-id args context]
                 (get-table-details tool-id (update args :table_id #(str "card__" %)) context))
           :id-name :table_id}})

(defn- dummy-get-item-details
  [context]
  (reduce (fn [messages viewed]
            (if-let [{getter-id :id, getter-fn :fn, :keys [id-name]} (-> viewed :type detail-getters)]
              (let [item-id (:ref viewed)
                    arguments {id-name item-id}
                    content (-> (getter-fn getter-id arguments context)
                                :output)]
                (into messages (dummy-tool-messages getter-id arguments content)))
              messages))
          []
          (:user-is-viewing context)))

(def ^:private dummy-tool-registry
  [dummy-get-current-user
   dummy-get-item-details])

(defn invoke-dummy-tools
  "Invoke `tool` with `context` if applicable and return the resulting context."
  [context]
  (let [context (or (not-empty context)
                    ;; for testing purposes, pretend the user is viewing a bunch of things at once
                    {:user-is-viewing [{:type :dashboard
                                        :ref 14
                                        :parameters []
                                        :is-embedded false}
                                       {:type :table
                                        :ref 27}
                                       {:type :model
                                        :ref 137}]})]
    (reduce (fn [messages tool]
              (into messages (tool context)))
            []
            dummy-tool-registry)))

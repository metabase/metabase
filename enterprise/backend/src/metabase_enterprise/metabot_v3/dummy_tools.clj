(ns metabase-enterprise.metabot-v3.dummy-tools
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.envelope :as envelope]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.metabot-v3.tools.who-is-your-favorite]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- get-current-user
  [_tool-id _arguments _e]
  {:output (if-let [{:keys [id email first_name last_name]}
                    (or (some-> api/*current-user* deref)
                        (t2/select-one [:model/User :id :email :first_name :last_name] api/*current-user-id*))]
             {:id id
              :name (str first_name " " last_name)
              :email-address email}
             "current user not found")})

(defn- get-dashboard-details
  [_tool-id {:keys [dashboard-id]} _e]
  {:output (or (t2/select-one [:model/Dashboard :id :description :name] dashboard-id)
               "dashboard not found")})

(defn- convert-metric
  [db-metric]
  (select-keys db-metric [:id :name :description]))

(declare ^:private table-details)

(defn- foreign-key-tables
  [metadata-provider fields]
  (when-let [target-field-ids (->> fields
                                   (into #{} (keep :fk-target-field-id))
                                   not-empty)]
    (let [table-ids (t2/select-fn-set :table_id :model/Field :id [:in target-field-ids])]
      (lib.metadata/bulk-metadata metadata-provider :metadata/table table-ids)
      (->> table-ids
           (into [] (keep #(table-details % {:include-foreign-key-tables? false
                                             :metadata-provider metadata-provider})))
           not-empty))))

(comment
  (mi/can-read? (t2/select-one :model/Table 27))
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (mi/can-read? (t2/select-one :model/Table 27))
    #_(metabot-v3.tools.u/get-table 27))

  (t2/select :model/User)

  (let [id 27
        mp (lib.metadata.jvm/application-database-metadata-provider 5)
        base (lib.metadata/table mp id)
        table-query (lib/query mp (lib.metadata/table mp id))
        cols (lib/returned-columns table-query)
        field-id-prefix (str "field_[" id "]_")]
    (some-> base
            (dissoc :db_id)
            (assoc :fields (mapv #(metabot-v3.tools.u/->result-column % field-id-prefix) cols)
                   :name (lib/display-name table-query))
            (assoc :metrics (mapv convert-metric (lib/available-metrics table-query)))
            (assoc :queryable-foreign-key-tables (foreign-key-tables mp cols))))
  -)

(defn- table-details
  [id {:keys [include-foreign-key-tables? metadata-provider]}]
  (when-let [base (if metadata-provider
                    (lib.metadata/table metadata-provider id)
                    (metabot-v3.tools.u/get-table id :db_id :description))]
    (let [mp (or metadata-provider
                 (lib.metadata.jvm/application-database-metadata-provider (:db_id base)))
          table-query (lib/query mp (lib.metadata/table mp id))
          cols (lib/returned-columns table-query)
          field-id-prefix (str "field_[" id "]_")]
      (-> {:id id
           :fields (mapv #(metabot-v3.tools.u/->result-column % field-id-prefix) cols)
           :name (lib/display-name table-query)}
          (m/assoc-some :description (:description base)
                        :metrics (not-empty (mapv convert-metric (lib/available-metrics table-query)))
                        :queryable-foreign-key-tables (when include-foreign-key-tables?
                                                        (not-empty (foreign-key-tables mp cols))))))))

(defn- card-details
  [id]
  (when-let [base (api.card/get-card id)]
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id base))
          card-query (lib/query mp (lib.metadata/card mp id))
          cols (lib/returned-columns card-query)
          external-id (str "card__" id)
          field-id-prefix (str "field_[" external-id "]_")]
      (-> {:id external-id
           :fields (mapv #(metabot-v3.tools.u/->result-column % field-id-prefix) cols)
           :name (lib/display-name card-query)}
          (m/assoc-some :description (:description base)
                        :metrics (not-empty (mapv convert-metric (lib/available-metrics card-query)))
                        :queryable-foreign-key-tables (not-empty (foreign-key-tables mp cols)))))))

(defn- get-table-details
  [_tool-id {:keys [table-id]} _e]
  (let [details (if-let [[_ card-id] (re-matches #"card__(\d+)" table-id)]
                  (card-details (parse-long card-id))
                  (table-details (parse-long table-id) {:include-foreign-key-tables? true}))]
    {:output (or details "table not found")}))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (let [id #_"card__137" #_"card__136" "27"]
      (get-table-details :get-table-details {:table-id id} {})))
  -)

(defn metric-details
  "Get metric details as returned by tools."
  [id]
  (when-let [card (api.card/get-card id)]
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))
          metric-query (lib/query mp (lib.metadata/card mp id))
          breakouts (lib/breakouts metric-query)
          base-query (lib/remove-all-breakouts metric-query)
          filterable-cols (lib/filterable-columns base-query)
          breakoutable-cols (lib/breakoutable-columns base-query)
          default-temporal-breakout (->> breakouts
                                         (map #(lib/find-matching-column % breakoutable-cols))
                                         (m/find-first lib.types.isa/temporal?))
          external-id (str "card__" id)
          field-id-prefix (str "field_[" external-id "]_")]
      {:id external-id
       :name (:name card)
       :description (:description card)
       :default-time-dimension-field-id (some-> default-temporal-breakout
                                                (metabot-v3.tools.u/->result-column field-id-prefix)
                                                :id)
       :queryable-dimensions (mapv #(metabot-v3.tools.u/->result-column % field-id-prefix) filterable-cols)})))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (metric-details 135))
  -)

(defn- get-metric-details
  [_tool-id {:keys [metric-id]} _e]
  (let [details (if-let [[_ card-id] (when (string? metric-id)
                                       (re-matches #"card__(\d+)" metric-id))]
                  (metric-details (parse-long card-id))
                  "invalid metric_id")]
    {:output (or details "metric not found")}))

(defn- get-report-details
  [_tool-id {:keys [report-id]} _e]
  (let [details (if-let [[_ card-id] (when (string? report-id)
                                       (re-matches #"card__(\d+)" report-id))]
                  (let [details (card-details (parse-long card-id))]
                    (some-> details
                            (select-keys [:id :description :name])
                            (assoc :result-columns (:fields details))))
                  "invalid report_id")]
    {:output (or details "report not found")}))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (let [id "card__90" #_"card__136" #_"27"]
      (get-table-details :get-table-details {:table-id id} {})))
  -)

(defn- dummy-tool-messages
  [tool-id arguments content]
  (let [call-id (str "call_" (u/generate-nano-id))]
    [{:content    nil
      :role       :assistant
      :tool-calls [{:id        call-id
                    :name      tool-id
                    :arguments arguments}]}

     {:content      content
      :role         :tool
      :tool-call-id call-id}]))

(defn- dummy-get-current-user
  [env]
  (let [content (:output (get-current-user :get-current-user {} env))]
    (reduce envelope/add-dummy-message env (dummy-tool-messages :get-current-user {} content))))

(def ^:private detail-getters
  {:dashboard {:id :get-dashboard-details
               :fn get-dashboard-details
               :arg-fn (fn [ref] {:dashboard-id ref})}
   :table {:id :get-table-details
           :fn get-table-details
           :arg-fn (fn [ref] {:table-id (str ref)})}
   :model {:id :get-table-details
           :fn get-table-details
           :arg-fn (fn [ref] {:table-id (str "card__" ref)})}
   :metric {:id :get-metric-details
            :fn get-metric-details
            :arg-fn (fn [ref] {:metric-id (str "card__" ref)})}
   :report {:id :get-report-details
            :fn get-report-details
            :arg-fn (fn [ref] {:report-id (str "card__" ref)})}})

(defn- dummy-get-item-details
  [{:keys [context] :as env}]
  (reduce (fn [env viewed]
            (if-let [{getter-id :id, getter-fn :fn, :keys [arg-fn]} (-> viewed :type detail-getters)]
              (let [arguments (arg-fn (:ref viewed))
                    content (-> (getter-fn getter-id arguments (envelope/context env))
                                :output)]
                (reduce envelope/add-dummy-message env (dummy-tool-messages getter-id arguments content)))
              env))
          env
          (:user-is-viewing context)))

(defn- execute-query
  [query-id legacy-query]
  (let [field-id-prefix (str "field_[" query-id "]_")
        mp (lib.metadata.jvm/application-database-metadata-provider (:database legacy-query))
        query (lib/query mp legacy-query)]
    {:type :query
     :query-id query-id
     :query legacy-query
     :result-columns (mapv #(metabot-v3.tools.u/->result-column % field-id-prefix) (lib/returned-columns query))}))

(defn- dummy-run-query
  [{:keys [context] :as env}]
  (transduce (filter (comp #{:adhoc} :type))
             (completing (fn [env {:keys [query]}]
                           (let [query-id (u/generate-nano-id)
                                 arguments {:query-id query-id}
                                 content (execute-query query-id query)]
                             (reduce envelope/add-dummy-message env (dummy-tool-messages :run-query arguments content)))))
             env
             (:user-is-viewing context)))

(def ^:private dummy-tool-registry
  [dummy-get-current-user
   dummy-get-item-details
   dummy-run-query])

(defn invoke-dummy-tools
  "Invoke `tool` with `context` if applicable and return the resulting context."
  [env]
  (reduce (fn [env tool]
            (tool env))
          env
          dummy-tool-registry))

(comment
  (def test-query {:database 5
                   :type :query
                   :query
                   {:joins
                    [{:strategy :left-join
                      :alias "Products"
                      :condition
                      [:=
                       [:field "PRODUCT_ID" {:base-type :type/Integer}]
                       [:field 285 {:base-type :type/BigInteger, :join-alias "Products"}]]
                      :source-table 30}]
                    :breakout
                    [[:field 279 {:base-type :type/Float, :join-alias "Products", :binning {:strategy :default}}]
                     [:field "CREATED_AT" {:base-type :type/DateTime, :temporal-unit :month}]]
                    :aggregation
                    [[:min [:field "SUBTOTAL" {:base-type :type/Float}]]
                     [:avg [:field "SUBTOTAL" {:base-type :type/Float}]]
                     [:max [:field "SUBTOTAL" {:base-type :type/Float}]]]
                    :source-table "card__136"
                    :filter [:> [:field "SUBTOTAL" {:base-type :type/Float}] 50]}})
  (def test-context
    ;; for testing purposes, pretend the user is viewing a bunch of things at once
    {:user-is-viewing [{:type :dashboard
                        :ref 10
                        :parameters []
                        :is-embedded false}
                       {:type :table
                        :ref 27}
                       {:type :model
                        :ref 137}
                       {:type :metric
                        :ref 135}
                       {:type :report
                        :ref 89}
                       {:type :adhoc
                        :query test-query}]})

  (defn test-envelope []
    {:context test-context
     :dummy-history []
     :history []})

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (invoke-dummy-tools (test-envelope)))
  -)

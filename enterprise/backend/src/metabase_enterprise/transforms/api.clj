(ns metabase-enterprise.transforms.api
  (:require
   [macaw.core :as macaw]
   [metabase-enterprise.transforms.api.transform-job]
   [metabase-enterprise.transforms.api.transform-tag]
   [metabase-enterprise.transforms.canceling :as transforms.canceling]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.models.transform-run-cancelation :as transform-run-cancelation]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.schema :as transforms.schema]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.validation :as perms.validation]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2])
  (:import
   (java.sql PreparedStatement)
   (net.sf.jsqlparser.statement.select PlainSelect)))

(comment metabase-enterprise.transforms.api.transform-job/keep-me
         metabase-enterprise.transforms.api.transform-tag/keep-me)

(set! *warn-on-reflection* true)

(mr/def ::transform-source ::transforms.schema/transform-source)

(mr/def ::transform-target ::transforms.schema/transform-target)

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

(defn- python-source-table-ref->table-id
  "Change source of python transform from name->table-ref to name->table-id.

  We now supported table-ref as source but since FE is still expecting table-id we need to temporarily do this.
  Should update FE to fully use table-ref"
  [transform]
  (if (transforms.util/python-transform? transform)
    (update-in transform [:source :source-tables]
               (fn [source-tables]
                 (update-vals source-tables #(if (int? %) % (:table_id %)))))
    transform))

(comment
  ;; Examples
  [{:id 1
    :name "Gadget Products"
    :source {:type "query"
             :query {:database 1
                     :type "native",
                     :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                              :template-tags {}}}}
    :target {:type "table"
             :schema "transforms"
             :name "gadget_products"}}])

(defn- check-database-feature
  [transform]
  (let [database (api/check-400 (t2/select-one :model/Database (transforms.i/target-db-id transform))
                                (deferred-tru "The target database cannot be found."))
        features (transforms.util/required-database-features transform)]
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
                   (deferred-tru "The database does not support the requested transform features."))
    (api/check-400 (not (transforms.util/db-routing-enabled? database))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled."))))

(defn- check-feature-enabled!
  [transform]
  (api/check (transforms.util/check-feature-enabled transform)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")]))

(defn- check-transforms-read-permission
  "Check that the current user has transforms permission for at least one database."
  []
  (api/check-403 (transforms.util/current-user-has-transforms-read-permission?)))

(defn get-transforms
  "Get a list of transforms."
  [& {:keys [last_run_start_time last_run_statuses tag_ids]}]
  (check-transforms-read-permission)
  (let [transforms (t2/select :model/Transform {:order-by [[:id :asc]]})]
    (into []
          (comp (transforms.util/->date-field-filter-xf [:last_run :start_time] last_run_start_time)
                (transforms.util/->status-filter-xf [:last_run :status] last_run_statuses)
                (transforms.util/->tag-filter-xf [:tag_ids] tag_ids)
                (map #(update % :last_run transforms.util/localize-run-timestamps))
                (map python-source-table-ref->table-id))
          (t2/hydrate transforms :last_run :transform_tag_ids :creator))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   query-params :-
   [:map
    [:last_run_start_time {:optional true} [:maybe ms/NonBlankString]]
    [:last_run_statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:tag_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]]]
  (get-transforms query-params))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new transform."
  [_route-params
   _query-params
   body :- [:map
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transforms.schema/transform-source]
            [:target ::transforms.schema/transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-403 (transforms.util/current-user-has-transforms-write-permission? (transforms.i/source-db-id body)))
  (check-database-feature body)
  (check-feature-enabled! body)

  (api/check (not (transforms.util/target-table-exists? body))
             403
             (deferred-tru "A table with that name already exists."))
  (let [transform (t2/with-transaction [_]
                    (let [tag-ids (:tag_ids body)
                          transform (t2/insert-returning-instance!
                                     :model/Transform
                                     (assoc (select-keys body [:name :description :source :target :run_trigger :collection_id])
                                            :creator_id api/*current-user-id*))]
                      ;; Add tag associations if provided
                      (when (seq tag-ids)
                        (transform.model/update-transform-tags! (:id transform) tag-ids))
                      ;; Return with hydrated tag_ids
                      (t2/hydrate transform :transform_tag_ids :creator)))]
    (events/publish-event! :event/transform-create {:object transform :user-id api/*current-user-id*})
    (python-source-table-ref->table-id transform)))

(defn get-transform
  "Get a specific transform."
  [id]
  (check-transforms-read-permission)
  (let [{:keys [target] :as transform} (api/check-404 (t2/select-one :model/Transform id))
        target-table (transforms.util/target-table (transforms.i/target-db-id transform) target :active true)]
    (-> transform
        (t2/hydrate :last_run :transform_tag_ids :creator)
        (u/update-some :last_run transforms.util/localize-run-timestamps)
        (assoc :table target-table)
        python-source-table-ref->table-id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (get-transform id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/dependencies"
  "Get the dependencies of a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (check-transforms-read-permission)
  (let [id->transform   (t2/select-pk->fn identity :model/Transform)
        _               (api/check-404 (get id->transform id))
        global-ordering (transforms.ordering/transform-ordering (vals id->transform))
        dep-ids         (get global-ordering id)
        dependencies    (map id->transform dep-ids)]
    (mapv python-source-table-ref->table-id (t2/hydrate dependencies :creator))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/run"
  "Get transform runs based on a set of filter params."
  [_route-params
   query-params :-
   [:map
    [:sort_column    {:optional true} [:enum "started_at" "ended_at"]]
    [:sort_direction {:optional true} [:enum "asc" "desc"]]
    [:transform_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:transform_tag_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:start_time {:optional true} [:maybe ms/NonBlankString]]
    [:end_time {:optional true} [:maybe ms/NonBlankString]]
    [:run_methods {:optional true} [:maybe (ms/QueryVectorOf [:enum "manual" "cron"])]]]]
  (check-transforms-read-permission)
  (-> (transform-run/paged-runs (assoc query-params
                                       :offset (request/offset)
                                       :limit  (request/limit)))
      (update :data #(map transforms.util/localize-run-timestamps %))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transforms.schema/transform-source]
            [:target {:optional true} ::transforms.schema/transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (let [transform (t2/with-transaction [_]
                    ;; Cycle detection should occur within the transaction to avoid race
                    (let [old (t2/select-one :model/Transform id)
                          new (merge old body)
                          target-fields #(-> % :target (select-keys [:schema :name]))]
                      (api/check-403 (and (mi/can-write? old) (mi/can-write? new)))

                      ;; we must validate on a full transform object
                      (check-feature-enabled! new)
                      (check-database-feature new)
                      (when (transforms.util/query-transform? old)
                        (when-let [{:keys [cycle-str]} (transforms.ordering/get-transform-cycle new)]
                          (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                                          {:status-code 400}))))
                      (api/check (not (and (not= (target-fields old) (target-fields new))
                                           (transforms.util/target-table-exists? new)))
                                 403
                                 (deferred-tru "A table with that name already exists.")))
                    (t2/update! :model/Transform id (dissoc body :tag_ids))
                    ;; Update tag associations if provided
                    (when (contains? body :tag_ids)
                      (transform.model/update-transform-tags! id (:tag_ids body)))
                    (t2/hydrate (t2/select-one :model/Transform id) :transform_tag_ids :creator))]
    (events/publish-event! :event/transform-update {:object transform :user-id api/*current-user-id*})
    (python-source-table-ref->table-id transform)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/check-404 (t2/select-one :model/Transform id))]
    (api/check-403 (mi/can-write? transform))
    (t2/delete! :model/Transform id)
    (events/publish-event! :event/transform-delete
                           {:object transform
                            :user-id api/*current-user-id*}))
  nil)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/table"
  "Delete a transform's output table."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/check-404 (t2/select-one :model/Transform id))]
    (api/check-403 (mi/can-write? (:source_database_id transform)))
    (transforms.util/delete-target-table-by-id! id))
  nil)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/cancel"
  "Cancel the current run for a given transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        run       (api/check-404 (transform-run/running-run-for-transform-id id))]
    (api/check-403 (mi/can-write? transform))
    (transform-run-cancelation/mark-cancel-started-run! (:id run))
    (when (transforms.util/python-transform? transform)
      (transforms.canceling/cancel-run! (:id run))))
  nil)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/run"
  "Run a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (check-transforms-read-permission)
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        _         (check-feature-enabled! transform)
        start-promise (promise)]
    (u.jvm/in-virtual-thread*
     (transforms.execute/execute! transform {:start-promise start-promise
                                             :run-method :manual}))
    (when (instance? Throwable @start-promise)
      (throw @start-promise))
    (let [result @start-promise
          run-id (when (and (vector? result) (= (first result) :started))
                   (second result))]
      (-> (response/response {:message (deferred-tru "Transform run started")
                              :run_id run-id})
          (assoc :status 202)))))

(defn- extract-columns-from-query
  "Attempts to extract column names from an MBQL query without executing it.

  Returns a vector of column names (as strings), or nil if extraction fails.

  The query is first compiled to native SQL, hen uses PreparedStatement.getMetaData()
  to inspect the query structure. This works for most modern JDBC drivers but may not
  be supported by all drivers or for all query types."
  [driver database-id query]
  (try
    (let [{:keys [query]} (qp.compile/compile query)]
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       database-id
       {}
       (fn [conn]
         (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement driver conn query [])]
           (when-let [rsmeta (.getMetaData stmt)]
             (let [columns (sql-jdbc.execute/column-metadata driver rsmeta)]
               (seq (mapv :name columns))))))))
    (catch Exception e
      (log/debugf e "Failed to extract columns from query: %s" (ex-message e))
      nil)))

(defn- simple-native-query?
  "Checks if a native SQL query string is simple enough for automatic checkpoint insertion."
  [sql-string]
  (try
    (let [^PlainSelect parsed (macaw/parsed-query sql-string)]
      (cond
        (not (instance? PlainSelect parsed))
        {:is_simple false
         :reason "Not a simple SELECT"}

        (.getLimit parsed)
        {:is_simple false
         :reason "Contains a LIMIT"}

        (.getOffset ^PlainSelect parsed)
        {:is_simple false
         :reason "Contains an OFFSET"}

        (seq (.getWithItemsList ^PlainSelect parsed))
        {:is_simple false
         :reason "Contains a CTE"}

        :else
        {:is_simple true}))
    (catch Exception e
      (log/debugf e "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

;; TODO (Cam 2025-12-04) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/is-simple-query"
  "Checks if a native SQL query string is simple enough for automatic checkpoint insertion"
  [_route-params
   _query-params
   {:keys [query]} :- [:map [:query string?]]]
  (api/check-superuser)
  (simple-native-query? query))

;; TODO (Cam 2025-12-04) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/extract-columns"
  "Extract column names from an MBQL query without executing it.

  Compiles the query to native SQL using [[qp.compile/compile-with-inline-parameters]],
  which handles parameterized queries with template tags. Then extracts column names
  using PreparedStatement metadata.

  Returns a map with a :columns key containing a vector of column names (strings).
  If extraction fails, returns nil for :columns."
  [_route-params
   _query-params
   {:keys [query]} :- [:map
                       [:query ::qp.schema/any-query]]]
  (api/check-superuser)
  (let [database-id (:database query)
        database (api/check-404 (t2/select-one :model/Database :id database-id))
        driver-name (driver/the-initialized-driver (:engine database))
        columns (extract-columns-from-query driver-name database-id query)]
    {:columns columns}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

(def ^{:arglists '([request respond raise])} transform-tag-routes
  "`/api/ee/transform-tag` routes."
  (api.macros/ns-handler 'metabase-enterprise.transforms.api.transform-tag +auth))

(def ^{:arglists '([request respond raise])} transform-job-routes
  "`/api/ee/transform-job` routes."
  (api.macros/ns-handler 'metabase-enterprise.transforms.api.transform-job +auth))

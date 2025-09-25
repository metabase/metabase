(ns metabase-enterprise.transforms.api
  (:require
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.api.transform-job]
   [metabase-enterprise.transforms.api.transform-tag]
   [metabase-enterprise.transforms.canceling :as transforms.canceling]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.models.transform-run-cancelation :as transform-run-cancelation]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver.util :as driver.u]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(comment metabase-enterprise.transforms.api.transform-job/keep-me
         metabase-enterprise.transforms.api.transform-tag/keep-me)

(set! *warn-on-reflection* true)

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query [:map [:database :int]]]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:map-of :string :int]]
     [:type [:= "python"]]
     [:body :string]]]])

(mr/def ::transform-target
  [:map
   [:database {:optional true} :int]
   [:type [:enum "table"]]
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
   [:name :string]])

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

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
  (let [database (api/check-400 (t2/select-one :model/Database (transforms.util/target-database-id transform))
                                (deferred-tru "The target database cannot be found."))
        feature (transforms.util/required-database-feature transform)]
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (driver.u/supports? (:engine database) feature database)
                   (deferred-tru "The database does not support the requested transform target type."))
    (api/check-400 (not (transforms.util/db-routing-enabled? database))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled."))))

(defn- check-feature-enabled!
  [transform]
  (api/check (transforms.util/check-feature-enabled transform)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")]))

(defn get-transforms
  "Get a list of transforms."
  []
  (api/check-superuser)
  (-> (t2/select :model/Transform)
      (t2/hydrate :last_run :transform_tag_ids)
      (->> (map #(update % :last_run transforms.util/localize-run-timestamps)))))

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  (get-transforms))

(api.macros/defendpoint :post "/"
  "Create a new transform."
  [_route-params
   _query-params
   body :- [:map
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transform-source]
            [:target ::transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (api/check-superuser)
  (check-database-feature body)
  (check-feature-enabled! body)
  (api/check (not (transforms.util/target-table-exists? body))
             403
             (deferred-tru "A table with that name already exists."))
  (t2/with-transaction [_]
    (let [tag-ids (:tag_ids body)
          transform (t2/insert-returning-instance!
                     :model/Transform (select-keys body [:name :description :source :target :run_trigger]))]
      ;; Add tag associations if provided
      (when (seq tag-ids)
        (transform.model/update-transform-tags! (:id transform) tag-ids))
      ;; Return with hydrated tag_ids
      (t2/hydrate transform :transform_tag_ids))))

(defn get-transform
  "Get a specific transform."
  [id]
  (api/check-superuser)
  (let [{:keys [target] :as transform} (api/check-404 (t2/select-one :model/Transform id))
        target-table (transforms.util/target-table (transforms.util/target-database-id transform) target :active true)]
    (-> transform
        (t2/hydrate :last_run :transform_tag_ids)
        (u/update-some :last_run transforms.util/localize-run-timestamps)
        (assoc :table target-table))))

(api.macros/defendpoint :get "/:id"
  "Get a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get transform" id)
  (get-transform id))

(api.macros/defendpoint :get "/:id/dependencies"
  "Get the dependencies of a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get dependencies for transform" id)
  (api/check-superuser)
  (let [id->transform (t2/select-pk->fn identity :model/Transform)
        _ (api/check-404 (get id->transform id))
        global-ordering (transforms.ordering/transform-ordering (vals id->transform))
        dep-ids (get global-ordering id)]
    (map id->transform dep-ids)))

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
  (log/info "get runs")
  (api/check-superuser)
  (-> (transform-run/paged-runs (assoc query-params
                                       :offset (request/offset)
                                       :limit  (request/limit)))
      (update :data #(map transforms.util/localize-run-timestamps %))))

(api.macros/defendpoint :put "/:id"
  "Update a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (log/info "put transform" id)
  (api/check-superuser)
  (t2/with-transaction [_]
    ;; Cycle detection should occur within the transaction to avoid race
    (let [old (t2/select-one :model/Transform id)
          new (merge old body)
          target-fields #(-> % :target (select-keys [:schema :name]))]
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
    (t2/hydrate (t2/select-one :model/Transform id) :transform_tag_ids)))

(api.macros/defendpoint :delete "/:id"
  "Delete a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform" id)
  (api/check-superuser)
  (t2/delete! :model/Transform id)
  nil)

(api.macros/defendpoint :delete "/:id/table"
  "Delete a transform's output table."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform target table" id)
  (api/check-superuser)
  (transforms.util/delete-target-table-by-id! id)
  nil)

(api.macros/defendpoint :post "/:id/cancel"
  "Cancel the current run for a given transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "canceling transform " id)
  (api/check-superuser)
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        run (api/check-404 (transform-run/running-run-for-transform-id id))]
    (transform-run-cancelation/mark-cancel-started-run! (:id run))
    (when (transforms.util/python-transform? transform)
      (transforms.canceling/cancel-run! (:id run))))
  nil)

(api.macros/defendpoint :post "/:id/run"
  "Run a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "run transform" id)
  (api/check-superuser)
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        _         (check-feature-enabled! transform)
        start-promise (promise)]
    (if (transforms.util/python-transform? transform)
      (u.jvm/in-virtual-thread*
       (transforms-python.execute/execute-python-transform! transform {:start-promise start-promise
                                                                       :run-method :manual}))
      (u.jvm/in-virtual-thread*
       (transforms.execute/run-mbql-transform! transform {:start-promise start-promise
                                                          :run-method :manual})))
    (when (instance? Throwable @start-promise)
      (throw @start-promise))
    (let [result @start-promise
          run-id (when (and (vector? result) (= (first result) :started))
                   (second result))]
      (-> (response/response {:message (deferred-tru "Transform run started")
                              :run_id run-id})
          (assoc :status 202)))))

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

(ns metabase-enterprise.transforms.api
  (:require
   [clojure.set :as set]
   [metabase-enterprise.transforms.api.transform-job]
   [metabase-enterprise.transforms.api.transform-tag]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.worker.core :as worker]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver.util :as driver.u]
   [metabase.request.core :as request]
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
  [:map
   [:type [:= "query"]]
   [:query [:map [:database :int]]]])

(mr/def ::transform-target
  [:map
   [:type [:enum "table" "view"]]
   [:schema {:optional true} [:or :string :nil]]
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

(defn- source-database-id
  [transform]
  (-> transform :source :query :database))

(defn- check-database-feature
  [transform]
  (let [database (api/check-400 (t2/select-one :model/Database (source-database-id transform))
                                (deferred-tru "The source database cannot be found."))
        feature (transforms.util/required-database-feature transform)]
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (driver.u/supports? (:engine database) feature database)
                   (deferred-tru "The database does not support the requested transform target type."))))

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  (api/check-superuser)
  (t2/hydrate (t2/select :model/Transform) :last_run :transform_tag_ids))

(api.macros/defendpoint :post "/"
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
  (api/check (not (transforms.util/target-table-exists? body))
             403
             (deferred-tru "A table with that name already exists."))
  (let [tag-ids (:tag_ids body)
        transform (t2/insert-returning-instance!
                   :model/Transform (select-keys body [:name :description :source :target :run_trigger]))]
    ;; Add tag associations if provided
    (when (seq tag-ids)
      (transform.model/update-transform-tags! (:id transform) tag-ids))
    ;; Return with hydrated tag_ids
    (t2/hydrate transform :transform_tag_ids)))

(api.macros/defendpoint :get "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get transform" id)
  (api/check-superuser)
  (let [{:keys [target] :as transform} (api/check-404 (t2/select-one :model/Transform id))
        database-id (source-database-id transform)
        target-table (transforms.util/target-table database-id target :active true)]
    (-> transform
        (t2/hydrate :last_run :transform_tag_ids)
        (assoc :table target-table))))

(api.macros/defendpoint :get "/run"
  [_route-params
   {:keys [sort_column sort_direction transform_ids statuses transform_tag_ids]} :-
   [:map
    [:sort_column    {:optional true} [:enum "started_at" "ended_at"]]
    [:sort_direction {:optional true} [:enum "asc" "desc"]]
    [:transform_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:transform_tag_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]]]
  (log/info "get runs")
  (api/check-superuser)
  (letfn [(work-run->api-run [run]
            (set/rename-keys run
                             {:run_id     :id
                              :work_id    :transform_id}))]
    (update (worker/paged-runs {:work_type      "transform"
                                :work_ids       transform_ids
                                :work_tag_ids   transform_tag_ids
                                :statuses       statuses
                                :sort_column    sort_column
                                :sort_direction sort_direction
                                :offset         (request/offset)
                                :limit          (request/limit)})
            :data #(mapv work-run->api-run %))))

(api.macros/defendpoint :put "/:id"
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
  (let [old (t2/select-one :model/Transform id)
        new (merge old body)
        target-fields #(-> % :target (select-keys [:schema :name]))]
    (check-database-feature new)
    (when-let [{:keys [cycle-str]} (transforms.ordering/get-transform-cycle new)]
      (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                      {:status-code 400})))
    (api/check (not (and (not= (target-fields old) (target-fields new))
                         (transforms.util/target-table-exists? new)))
               403
               (deferred-tru "A table with that name already exists.")))
  (t2/update! :model/Transform id (dissoc body :tag_ids))
  ;; Update tag associations if provided
  (when (contains? body :tag_ids)
    (transform.model/update-transform-tags! id (:tag_ids body)))
  (t2/hydrate (t2/select-one :model/Transform id) :transform_tag_ids))

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform" id)
  (api/check-superuser)
  (t2/delete! :model/Transform id)
  nil)

(api.macros/defendpoint :delete "/:id/table"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform target table" id)
  (api/check-superuser)
  (transforms.util/delete-target-table-by-id! id)
  nil)

(api.macros/defendpoint :post "/:id/cancel"
  [{:keys [id]} :- [:map
                    [:id :string]]]
  (log/info "canceling transform " id)
  (api/check-superuser)
  (let [run (api/check-404 (worker/running-run-for-work-id id "transform"))]
    (if (:is_local run)
      (worker/mark-cancel-started-run! (:run_id run))
      (worker/cancel! (:run_id run))))
  nil)

(api.macros/defendpoint :post "/:id/run"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "run transform" id)
  (api/check-superuser)
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        start-promise (promise)]
    (u.jvm/in-virtual-thread*
     (transforms.execute/run-mbql-transform! transform {:start-promise start-promise
                                                        :run-method :manual}))
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

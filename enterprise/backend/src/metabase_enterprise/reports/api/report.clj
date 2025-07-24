(ns metabase-enterprise.reports.api.report
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- report-query [where-clause]
  {:select   [:report.id
              :name
              :document
              :content_type
              :collection_id
              [:version_identifier :version]
              [:report.created_at :created_at]
              [:report.updated_at :updated_at]]
   :from     [[(t2/table-name :model/Report) :report]]
   :join     [[(t2/table-name :model/ReportVersion) :ver] [:= :report.id :ver.report_id]]
   :order-by [[:report.id :asc]]
   :where    where-clause})

(defn- get-report [id version]
  (api/check-404
   (api/read-check
    (t2/select-one :model/Report
                   (report-query [:and
                                  [:= :report.id id]
                                  (if (some? version)
                                    [:= :version_identifier version]
                                    [:= :report.current_version_id :ver.id])])))))

(api.macros/defendpoint :get "/"
  "Gets existing `Reports`."
  [_route-params
   _query-params]
  (t2/query (report-query (collection/visible-collection-filter-clause))))

(api.macros/defendpoint :post "/"
  "Create a new `Report`."
  [_route-params
   _query-params
   {:keys [name document version created_at updated_at collection_id]}
   :- [:map
       [:name :string]
       [:document :string]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-superuser)
  (get-report (t2/with-transaction [conn]
                (let [report-id (t2/insert-returning-pk! :conn conn :model/Report {:name name
                                                                                   :collection_id collection_id})
                      report-version-id (t2/insert-returning-pk! :conn conn :model/ReportVersion
                                                                 {:report_id          report-id
                                                                  :document           document
                                                                  :content_type       "text/markdown"
                                                                  :version_identifier 1
                                                                  :user_id            api/*current-user-id*})
                      _ (t2/select-one :conn conn :model/Report :id report-id)
                      _ (t2/select-one :conn conn :model/ReportVersion :report_id report-id)
                      _ (t2/update! :conn conn :model/Report report-id {:current_version_id report-version-id})]
                  report-id)) nil))

(api.macros/defendpoint :get "/:report-id"
  "Returns an existing Report by ID."
  [{:keys [report-id]} :- [:map [:report-id ms/PositiveInt]]
   {:keys [version]} :- [:map [:version {:optional true} ms/PositiveInt]]]
  (get-report report-id version))

(api.macros/defendpoint :put "/:report-id"
  "Updates an existing `Report`."
  [{:keys [report-id]} :- [:map
                           [:report-id ms/PositiveInt]]
   {:keys [version]}
   body :- [:map
            [:name {:optional true} :string]
            [:document {:optional true} :string]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-superuser)
  (let [existing-report (get-report report-id nil)]
    (get-report
     (t2/with-transaction [conn]
       (let [new-report-version-id (when (:document body)
                                     (t2/insert-returning-pk! :conn conn :model/ReportVersion
                                                              {:report_id          report-id
                                                               :document           (:document body)
                                                               :content_type       "text/markdown"
                                                               :version_identifier (inc (:version existing-report))
                                                               :user_id            api/*current-user-id*}))
             _ (t2/update! :conn conn :model/Report report-id {:name               (if (contains? body :name)
                                                                                     (:name body)
                                                                                     :name)
                                                               :collection_id      (if (contains? body :collection_id)
                                                                                     (:collection_id body)
                                                                                     :collection_id)
                                                               :current_version_id (or new-report-version-id
                                                                                       :current_version_id)
                                                               :updated_at         (mi/now)})]
         report-id)) nil)))

(api.macros/defendpoint :get "/:report-id/versions"
  "Returns the versions of a given report."
  [{:keys [report-id]} :- [:map
                           [:report-id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/Report :id report-id))
  (map #(-> %
            (select-keys [:id :document :content_type :version_identifier :user_id :created_at :parent_version_id])
            (set/rename-keys {:version_identifier :version
                              :user_id            :creator}))
       (t2/select :model/ReportVersion :report_id report-id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/report/` routes."
  (api.macros/ns-handler *ns* +auth))

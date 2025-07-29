(ns metabase-enterprise.reports.api.report
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]

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

(defn- validate-cards-for-report
  "Validates that all provided card-ids exist and have type :in_report.
   Returns the card records if all are valid, throws exception otherwise."
  [card-ids]
  (when (seq card-ids)
    (let [cards (t2/select :model/Card :id [:in card-ids])]
      ;; Check all cards were found
      (when (not= (count cards) (count card-ids))
        (let [found-ids (set (map :id cards))
              missing-ids (remove found-ids card-ids)]
          (throw (ex-info (tru "The following card IDs do not exist: {0}. Please verify the card IDs are correct and the cards have not been deleted." (vec missing-ids))
                          {:status-code 404
                           :error-type :cards-not-found
                           :missing-card-ids missing-ids}))))
      ;; Check all cards have type :in_report
      (let [invalid-cards (remove #(= :in_report (keyword (:type %))) cards)]
        (when (seq invalid-cards)
          (throw (ex-info (tru "The following cards cannot be used in reports because they have the wrong type: {0}. Only cards with type ''in_report'' can be associated with reports. Please change the card type to ''in_report'' or use different cards."
                               (mapv #(str "card " (:id %) " (type: " (:type %) ")") invalid-cards))
                          {:status-code 400
                           :error-type :invalid-card-type
                           :invalid-cards (mapv #(select-keys % [:id :type]) invalid-cards)}))))
      cards)))

(defn get-report [id version]
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
   {:keys [name document version created_at updated_at collection_id card-ids]}
   :- [:map
       [:name :string]
       [:document :string]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:card-ids {:optional true} [:vector ms/PositiveInt]]]]
  (api/check-superuser)
  (get-report (t2/with-transaction [conn]
                ;; Validate cards first if provided
                (let [validated-cards (validate-cards-for-report card-ids)
                      report-id (t2/insert-returning-pk! :conn conn :model/Report {:name name
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
                  ;; Update cards with the new report-id if cards were validated
                  (when validated-cards
                    (doseq [card validated-cards]
                      (t2/update! :conn conn :model/Card (:id card) {:report_document_id report-id})))
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
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
            [:card-ids {:optional true} [:vector ms/PositiveInt]]]]
  (api/check-superuser)
  (let [existing-report (get-report report-id nil)]
    (get-report
     (t2/with-transaction [conn]
       ;; Validate cards first if provided
       (let [validated-cards (when (:card-ids body)
                               (validate-cards-for-report (:card-ids body)))
             new-report-version-id (when (:document body)
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
         ;; Update cards with the report-id if cards were validated
         (when validated-cards
           ;; Clear existing card associations for this report
           (t2/update! :conn conn :model/Card {:report_document_id report-id} {:report_document_id nil})
           ;; Set new card associations
           (doseq [card validated-cards]
             (t2/update! :conn conn :model/Card (:id card) {:report_document_id report-id})))
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

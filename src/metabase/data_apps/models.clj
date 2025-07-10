(ns metabase.data-apps.models
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/DataApp           [_model] :data_app)
(methodical/defmethod t2/table-name :model/DataAppDefinition [_model] :data_app_definition)
(methodical/defmethod t2/table-name :model/DataAppRelease    [_model] :data_app_release)

(doseq [model [:model/DataApp
               :model/DataAppDefinition
               :model/DataAppRelease]]
  (derive model :metabase/model))

(derive :model/DataApp :hook/timestamped?)
(derive :model/DataApp :hook/entity-id)
(derive :model/DataAppRelease :hook/timestamped?)
(derive :model/DataAppDefinition :hook/created-at-timestamped?)

;;------------------------------------------------------------------------------------------------;;
;;                                       :model/DataApp                                           ;;
;;------------------------------------------------------------------------------------------------;;

(def ^:private data-app-statuses #{:private :published :archived})

(def ^:private simple-slug-regex #"^[0-9a-zA-Z_-]+$")

(t2/deftransforms :model/DataApp
  {:status (mi/transform-validator mi/transform-keyword (partial mi/assert-enum data-app-statuses))
   :slug   (mi/transform-validator mi/transform-identity (partial mi/assert-regex simple-slug-regex))})

;; TODO: revisit permissions model
(defmethod mi/can-read? :model/DataApp
  ([_data-app]
   true)
  ([_ _pk]
   true))

(defmethod mi/can-create? :model/DataApp
  ([_data-app]
   (mi/superuser?))
  ([_ _pk]
   (mi/superuser?)))

(defmethod mi/can-update? :model/DataApp
  ([_data-app]
   (mi/superuser?))
  ([_ _pk]
   (mi/superuser?)))

;;------------------------------------------------------------------------------------------------;;
;;                                   :model/DataAppDefinition                                     ;;
;;------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/DataAppDefinition
  {:config mi/transform-json})

(mr/def ::AppDefinitionConfig
  [:maybe [:map {:closed true}
           [:actions [:sequential :map]]
           [:parameters [:sequential :map]]
           [:pages [:sequential :map]]]])

(defn- validate-app-definition
  "Validate an AppDefinition."
  [app-definition]
  (mu/validate-throw ::AppDefinitionConfig (:config app-definition)))

(t2/define-before-insert :model/DataAppDefinition
  [instance]
  (validate-app-definition instance)
  instance)

(t2/define-before-update :model/DataAppDefinition
  [instance]
  (throw (ex-info "AppDefinition is append-only and cannot be updated"
                  {:status-code 400
                   :changes     (t2/changes instance)})))

(defn- next-revision-number-hsql
  [app-id]
  [:coalesce
   [:+
    ;; MySQL requires an extra subselect wrapper to circumvent its rule against having a source table as the target.
    {:select [:%max.revision_number]
     :from [[{:select [:*] :from [:data_app_definition]} :dumb_alias]]
     :where [:= :app_id app-id]}
    [:inline 1]]
   [:inline 1]])

;;------------------------------------------------------------------------------------------------;;
;;                                    :model/DataAppRelease                                       ;;
;;------------------------------------------------------------------------------------------------;;

(t2/define-before-update :model/DataAppRelease
  [instance]
  (let [changed-keys (-> instance t2/changes keys set)]
    (when-not (= #{:retracted} changed-keys)
      (throw (ex-info (format "AppRelease is append-only. Only 'retracted' field can be updated, but got: %s"
                              changed-keys)
                      {:status-code 400}))))
  instance)

;;------------------------------------------------------------------------------------------------;;
;;                                       Serialization                                            ;;
;;------------------------------------------------------------------------------------------------;;

(comment
  #_todo)

;;------------------------------------------------------------------------------------------------;;
;;                                        Public APIs                                             ;;
;;------------------------------------------------------------------------------------------------;;

(defn set-latest-definition!
  "Create a new definition for an existing app."
  [app-id definition]
  (t2/insert-returning-instance! :model/DataAppDefinition
                                 (merge definition
                                        {:app_id          app-id
                                         :revision_number (next-revision-number-hsql app-id)})))

(defn create-app!
  "Create a new App with an initial definition."
  [app-data]
  (t2/with-transaction [_conn]
    (let [app (t2/insert-returning-instance! :model/DataApp (merge
                                                             {:status :private}
                                                             (dissoc app-data :definition)))
          app-definition (when-let [definition (:definition app-data)]
                           (set-latest-definition! (:id app) definition))]
      (assoc app :definition app-definition))))

(defn latest-definition
  "Get the latest definition (released or not) for a data app."
  [app-id]
  (t2/select-one :model/DataAppDefinition
                 :app_id app-id
                 {:order-by [[:revision_number :desc]]}))

(defn release!
  "Release the latest definition of an app. Also take the app out of private or archived if necessary."
  [app-id creator-id]
  (t2/with-transaction [_conn]
    (let [latest-def (latest-definition app-id)]
      (when-not latest-def
        (throw (ex-info "No definition found for app" {:app-id app-id})))
      (t2/update! :model/DataApp app-id {:status :published})
      (t2/insert-returning-instance! :model/DataAppRelease
                                     {:app_id            app-id
                                      :app_definition_id (:id latest-def)
                                      :creator_id        creator-id}))))

(defn released-definition
  "Get the latest released definition for a data app."
  [app-id]
  (when-let [release-definition-id (t2/select-one-fn :app_definition_id
                                                     :model/DataAppRelease
                                                     :app_id app-id
                                                     :retracted false
                                                     ;; it's append only table so sorting by id for better perf
                                                     {:order-by [[:id :desc]]})]
    (t2/select-one :model/DataAppDefinition release-definition-id)))

(defn latest-release
  "Get the latest release info for a data app."
  [app-id]
  ;; app_definition_id is only needed for testing
  (t2/select-one [:model/DataAppRelease :id :app_definition_id :created_at]
                 :app_id app-id
                 :retracted false
                 {:order-by [[:id :desc]]}))

(defn get-published-data-app
  "Get the published version of a data app by id."
  [slug]
  (let [app (t2/select-one :model/DataApp :slug slug :status :published)
        _   (when-not app
              (throw (ex-info "Not found." {:status-code 404})))
        released-definition (released-definition (:id app))]
    (when-not released-definition
      (throw (ex-info "Data app is not released"
                      {:status-code 404})))
    (assoc app :definition released-definition)))

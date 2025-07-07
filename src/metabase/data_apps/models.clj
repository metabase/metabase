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
(derive :model/DataAppDefinition :hook/created-at-timestamped?)
(derive :model/DataAppDefinition :hook/entity-id)

;;------------------------------------------------------------------------------------------------;;
;;                                       :model/DataApp                                           ;;
;;------------------------------------------------------------------------------------------------;;

(def ^:private data-app-statuses #{:private :published :archived})

(t2/deftransforms :model/DataApp
  {:status (mi/transform-validator mi/transform-keyword (partial mi/assert-enum data-app-statuses))})

;;------------------------------------------------------------------------------------------------;;
;;                                   :model/DataAppDefinition                                     ;;
;;------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/DataAppDefinition
  {:config mi/transform-json})

(mr/def ::AppDefinitionConfig
  [:maybe [:map {:closed true}
           [:version pos-int?]]])

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

(defn- next-revision-number
  "Get the next revision number for a given app."
  [app-id]
  (inc (or (:max (t2/select-one [:model/DataAppDefinition [:%max.revision_number :max]] :app_id app-id))
           0)))

;;------------------------------------------------------------------------------------------------;;
;;                                    :model/DataAppRelease                                       ;;
;;------------------------------------------------------------------------------------------------;;

(t2/define-before-insert :model/DataAppRelease
  [instance]
  (merge {:published_at :%now} instance))

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

(defn new-definition!
  "Create a new definition for an existing app."
  [app-id definition]
  (t2/insert-returning-instance! :model/DataAppDefinition
                                 (merge definition
                                        {:app_id          app-id
                                         :revision_number (next-revision-number app-id)})))

(defn create-app!
  "Create a new App with an initial definition."
  [app-data]
  (t2/with-transaction [_conn]
    (let [app            (t2/insert-returning-instance! :model/DataApp (dissoc app-data :definition))
          app-definition (new-definition! (:id app) (:definition app-data))]
      (assoc app :definition app-definition))))

(defn publish!
  "Publish a new definition of an app."
  [app-id app-definition-id]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instance! :model/DataAppRelease
                                   {:app_id            app-id
                                    :app_definition_id app-definition-id
                                    :retracted         false})))

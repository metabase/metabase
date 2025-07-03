(ns metabase.data-apps.models
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/App           [_model] :app)
(methodical/defmethod t2/table-name :model/AppDefinition [_model] :app_definition)
(methodical/defmethod t2/table-name :model/AppPublishing [_model] :app_publishing)

(doseq [model [:model/App
               :model/AppDefinition
               :model/AppPublishing]]
  (derive model :metabase/model))

(derive :model/App :hook/timestamped?)

(derive :model/AppDefinition :hook/entity-id)

;;------------------------------------------------------------------------------------------------;;
;;                                         :model/App                                             ;;
;;------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/App
  {:config mi/transform-json})

;;------------------------------------------------------------------------------------------------;;
;;                                     :model/AppDefinition                                       ;;
;;-----------------------------------------------------------------------------------------------;;

(mr/def ::AppDefinitionConfig
  [:maybe [:map {:closed true}
           [:version pos-int?]]])

(defn- validate-app-definition
  "Validate an AppDefinition."
  [app-definition]
  (mu/validate-throw ::AppDefinitionConfig (:config app-definition)))

(defn- next-version
  [app-id]
  (or (t2/select-one-fn :version :model/AppDefinition :app_id app-id {:order-by [[:version :desc]]
                                                                      :limit 1})
      0))

(t2/define-before-insert :model/AppDefinition
  [instance]
  (validate-app-definition instance)
  (assoc instance :version (next-version (:app_id instance))))

(t2/define-before-update :model/AppDefinition
  [instance]
  ;; AppDefinition is append-only, so prevent updates
  (throw (ex-info "AppDefinition is append-only and cannot be updated"
                  {:status-code 400
                   :changes     (t2/changes instance)})))

;;------------------------------------------------------------------------------------------------;;
;;                                     :model/AppPublishing                                       ;;
;;------------------------------------------------------------------------------------------------;;

(defn- ensure-single-active-publication!
  "Ensure at most one active publication per app_id."
  [instance]
  (when (:active instance)
    (t2/update! :model/AppPublishing
                {:app_id (:app_id instance)
                 :active true}
                {:active false}))
  instance)

(t2/define-before-insert :model/AppPublishing
  [instance]
  (let [instance (merge {:active       true
                         :published_at :%now}
                        instance)]
    (ensure-single-active-publication! instance)
    instance))

(t2/define-before-update :model/AppPublishing
  [instance]
  ;; AppPublishing is append-only, so prevent updates except for active status
  (let [changed-keys (-> instance t2/changes keys set)]
    (when-not (= #{:active} changed-keys)
      (throw (ex-info (format "AppPublishing is append-only. Only 'active' field can be updated, but got: %s"
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

(defn create-app!
  "Create a new App with an initial definition."
  [app-data]
  (t2/with-transaction [_conn]
    (let [app (t2/insert-returning-pk! :model/App (dissoc app-data :definition))
          app-definition (t2/insert-returning-instance! :model/AppDefinition
                                                        {:app_id (:id app)
                                                         :definition (:definition app-data)})]
      (assoc app :definition app-definition))))

(defn new-definition!
  "Create a new definition for an existing app."
  [app-id definition]
  (t2/insert-returning-instance! :model/AppDefinition
                                 {:app_id app-id
                                  :definition definition}))

(defn publish!
  "Publish an new definition of an app"
  [app-id app-definition-id]
  (t2/insert-returning-instance! :model/AppPublishing
                                 {:app_id app-id
                                  :app_definition_id app-definition-id
                                  :active true}))

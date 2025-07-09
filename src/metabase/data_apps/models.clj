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

(t2/deftransforms :model/DataApp
  {:status (mi/transform-validator mi/transform-keyword (partial mi/assert-enum data-app-statuses))})

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
  [:coalesce [:+ [:inline 1]
              {:select [:%max.revision_number]
               :from [:data_app_definition]
               :where [:= :app_id app-id]}]
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
    (let [app            (t2/insert-returning-instance! :model/DataApp (dissoc app-data :definition))
          app-definition (when-let [definition (:definition app-data)]
                           (set-latest-definition! (:id app) definition))]
      (assoc app :definition app-definition))))

(defn publish!
  "Publish a new definition of an app."
  [app-id app-definition-id]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instance! :model/DataAppRelease
                                   {:app_id            app-id
                                    :app_definition_id app-definition-id})))

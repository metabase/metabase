(ns metabase.data-apps.models
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private retention-max-per-app 20)
(def ^:private retention-max-total 1000)

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
  {:status (mi/transform-validator mi/transform-keyword  (fn [v] (mi/assert-enum data-app-statuses (keyword v))))
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

(declare released-definition)

(defmethod serdes/make-spec "DataAppRelease" [_model-name _opts]
  {:copy      []
   :skip      []
   :transform {:created_at        (serdes/date)
               :updated_at        (serdes/date)
               :creator_id        (serdes/fk :model/User)
               :app_id            (serdes/fk :model/DataApp)
               :app_definition_id (serdes/parent-ref)}})

(defmethod serdes/make-spec "DataAppDefinition" [_model-name opts]
  {:copy      [:revision_number :config]
   :skip      []
   :transform {:created_at (serdes/date)
               :creator_id (serdes/fk :model/User)
               :app_id     (serdes/parent-ref)
               :release    (serdes/nested :model/DataAppRelease :app_definition_id opts)}})

(defn- export-released-definition
  "Export the released definition for a data app, if it exists."
  [data-app]
  (when-let [definition (released-definition (:id data-app))]
    [(serdes/extract-one "DataAppDefinition" {} (assoc definition :release [(t2/select-one :model/DataAppRelease :app_definition_id (:id definition))]))]))

;; data-apps => definition => release

(defmethod serdes/make-spec "DataApp" [_model-name opts]
  {:copy      [:name :description :slug :status :entity_id]
   :skip      []
   :transform {:created_at          (serdes/date)
               :updated_at          (serdes/date)
               :creator_id          (serdes/fk :model/User)
               :released_definition (assoc (serdes/nested :model/DataAppDefinition :app_id opts)
                                           :export-with-context (fn [data-app _k _input] (export-released-definition data-app)))}})

(defmethod serdes/dependencies "DataApp" [_]
  #{})

;;------------------------------------------------------------------------------------------------;;
;;                                        Public APIs                                             ;;
;;------------------------------------------------------------------------------------------------;;

;; A simple way to avoid concurrent or redundant pruning, and for pruning to happen off the main thread.
(def ^:private pruner-dirty (atom false))
(def ^:private pruner (agent :never-started))

(defn- prune-definitions!
  "Remove older definitions that don't correspond to releases or latest working drafts."
  ([]
   (prune-definitions! retention-max-per-app retention-max-total))
  ([retention-max-per-app retention-max-total]
   (t2/delete! :model/DataAppDefinition
               {:where [:in :id
                        {:with   [[:protected_definitions
                                   {:select [:dad.id]
                                    :from   [[:data_app_definition :dad]]
                                    :where  [:or
                                             ;; Released definitions
                                             [:exists {:select [1]
                                                       :from   [[:data_app_release :dar]]
                                                       :where  [:and
                                                                [:= :dar.app_definition_id :dad.id]
                                                                [:= :dar.retracted false]]}]
                                             ;; The highest revision per app
                                             [:exists {:select [1]
                                                       :from   [[:data_app_definition :dad2]]
                                                       :where  [:and
                                                                [:= :dad2.app_id :dad.app_id]
                                                                [:= :dad2.revision_number
                                                                 {:select [:%max.revision_number]
                                                                  :from   [[:data_app_definition :dad3]]
                                                                  :where  [:= :dad3.app_id :dad.app_id]}]
                                                                [:= :dad2.id :dad.id]]}]]}]

                                  [:ranked
                                   {:select [:dad.id :dad.app_id :dad.revision_number :dad.created_at
                                             [[:raw "ROW_NUMBER() OVER (PARTITION BY dad.app_id ORDER BY dad.revision_number DESC)"] :app_rank]
                                             [[:raw "ROW_NUMBER() OVER (ORDER BY dad.id DESC)"] :global_rank]]
                                    :from   [[:data_app_definition :dad]]
                                    :where  [:not [:exists {:select [1]
                                                            :from   [[:protected_definitions :pd]]
                                                            :where  [:= :pd.id :dad.id]}]]}]]

                         :select [:id]
                         :from   [:ranked]
                         :where  [:or
                                  [:> :app_rank retention-max-per-app]
                                  [:> :global_rank retention-max-total]]}]})))

(defn- prune-definitions-async!
  ([]
   (prune-definitions-async! retention-max-per-app retention-max-total))
  ([& opts]
   (reset! pruner-dirty true)
   (send-off pruner (fn [existing] (if @pruner-dirty :started existing)))
   (send-off pruner (fn [last-status]
                      (if @pruner-dirty
                        (try
                          (apply prune-definitions! opts)
                          :finished
                          (catch Exception e
                            (log/warn e "Failure pruning Data App definitions")
                            :failed)
                          (finally
                            ;; Reset the dirty flag even if it failed, to avoid spinning on expensive failures.
                            (reset! pruner-dirty false)))
                        (get #{:skipped :finished} last-status :skipped))))))

(defn set-latest-definition!
  "Create a new definition for an existing app."
  [app-id definition]
  (u/prog1 (t2/insert-returning-instance! :model/DataAppDefinition
                                          (merge definition
                                                 {:app_id          app-id
                                                  :revision_number (next-revision-number-hsql app-id)}))
    (prune-definitions-async!)))

(defn create-app!
  "Create a new App with an initial definition."
  [app-data]
  (t2/with-transaction [_conn]
    (let [app (t2/insert-returning-instance! :model/DataApp (merge {:status :private} (dissoc app-data :definition)))]
      (when-let [definition (:definition app-data)]
        (set-latest-definition! (:id app) definition))
      (assoc app :definition (:definition app-data)))))

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
                                                     ;; it's an append-only table so sorting by id for better perf
                                                     {:order-by [[:id :desc]]})]
    (t2/select-one :model/DataAppDefinition release-definition-id)))

(defn latest-release
  "Get the latest release info for a data app."
  [app-id]
  (t2/select-one :model/DataAppRelease
                 :app_id app-id
                 :retracted false
                 {:order-by [[:id :desc]]}))

(defn get-published-data-app
  "Get the published version of a data app by id."
  [slug]
  (let [app                 (t2/select-one :model/DataApp :slug slug :status :published)
        _                   (when-not app
                              (throw (ex-info "Not found." {:status-code 404})))
        released-definition (released-definition (:id app))]
    (when-not released-definition
      (throw (ex-info "Data app is not released"
                      {:status-code 404})))
    (assoc app :definition released-definition)))
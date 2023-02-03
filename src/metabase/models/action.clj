(ns metabase.models.action
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.query :as query]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.models.serialization.util :as serdes.util]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan.models :as models]))

(models/defmodel QueryAction :query_action)
(models/defmodel HTTPAction :http_action)
(models/defmodel ImplicitAction :implicit_action)
(models/defmodel Action :action)

;;; You can read/write an Action if you can read/write its model (Card)
(doto Action
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(defmethod mi/perms-objects-set Action
  [instance read-or-write]
  (mi/perms-objects-set (db/select-one Card :id (:model_id instance)) read-or-write))

(models/add-type! ::json-with-nested-parameters
  :in  (comp mi/json-in
             (fn [template]
               (u/update-if-exists template :parameters mi/normalize-parameters-list)))
  :out (comp (fn [template]
               (u/update-if-exists template :parameters (mi/catch-normalization-exceptions mi/normalize-parameters-list)))
             mi/json-out-with-keywordization))

(mi/define-methods
 Action
 {:types      (constantly {:type                   :keyword
                           :parameter_mappings     :parameters-list
                           :parameters             :parameters-list
                           :visualization_settings :visualization-settings})
  :properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})})

(defn- pre-update
  [action]
  ;; All possible sub-type columns
  (when-let [sub-type-action (not-empty (select-keys action [:kind
                                                             :database_id :dataset_query
                                                             :template :response_handle :error_handle]))]
    (assoc sub-type-action :action_id (or (:id action) (:action_id action)))))

(defn- pre-delete
  [action]
  (db/simple-delete! Action :id (:action_id action))
  action)

(def ^:private Action-subtype-IModel-impl
  "[[models/IModel]] impl for `HTTPAction`, `ImplicitAction`, and `QueryAction`"
  {:primary-key (constantly :action_id) ; This is ok as long as we're 1:1
   :pre-delete pre-delete
   :pre-update pre-update})

(mi/define-methods
 QueryAction
 (merge
  Action-subtype-IModel-impl
  {:types (constantly {:dataset_query :json})}))

(mi/define-methods
 ImplicitAction
 Action-subtype-IModel-impl)

(mi/define-methods
 HTTPAction
 (merge Action-subtype-IModel-impl
        {:types (constantly {:template ::json-with-nested-parameters})}))

(defn insert!
  "Inserts an Action and related type table. Returns the action id."
  [action-data]
  (db/transaction
    (let [action-columns [:type :name :description :model_id :parameters :parameter_mappings :visualization_settings :creator_id]
          action         (db/insert! Action (select-keys action-data action-columns))
          model          (case (keyword (:type action))
                           :http HTTPAction
                           :query QueryAction
                           :implicit ImplicitAction)]
      (db/execute! {:insert-into model
                    :values [(-> (apply dissoc action-data action-columns)
                                 (mi/add-entity-id)
                                 (u/update-if-exists :template json/encode)
                                 (u/update-if-exists :dataset_query json/encode)
                                 (assoc :action_id (:id action)))]})
      (:id action))))

(defn select-action
  "Selects an action and fills in the subtype data.
   `options` is passed to `db/select-one` `& options` arg."
  [& options]
  (let [action  (apply db/select-one Action options)
        subtype (case (:type action)
                  :http HTTPAction
                  :query QueryAction
                  :implicit ImplicitAction)]
    (merge action (db/select-one subtype :action_id (:id action)))))

(defn- normalize-query-actions [actions]
  (when (seq actions)
    (let [query-actions (db/select QueryAction :action_id [:in (map :id actions)])
          action-id->query-actions (m/index-by :action_id query-actions)]
      (for [action actions]
        (merge action (-> action :id action-id->query-actions (dissoc :action_id)))))))

(defn- normalize-http-actions [actions]
  (when (seq actions)
    (let [http-actions (db/select HTTPAction :action_id [:in (map :id actions)])
          http-actions-by-action-id (m/index-by :action_id http-actions)]
      (map (fn [action]
             (let [http-action (get http-actions-by-action-id (:id action))]
               (-> action
                   (merge
                     {:disabled false}
                     (select-keys http-action [:template :response_handle :error_handle])
                     (select-keys (:template http-action) [:parameters :parameter_mappings])))))
           actions))))

(defn- normalize-implicit-actions [actions]
  (when (seq actions)
    (let [implicit-actions (db/select ImplicitAction :action_id [:in (map :id actions)])
          implicit-actions-by-action-id (m/index-by :action_id implicit-actions)]
      (map (fn [action]
             (let [implicit-action (get implicit-actions-by-action-id (:id action))]
               (merge action
                     (select-keys implicit-action [:kind]))))
           actions))))

(defn select-actions
  "Select Actions and fill in sub type information.
   `options` is passed to `db/select` `& options` arg"
  [& options]
  (let [{:keys [query http implicit]} (group-by :type (apply db/select Action options))
        query-actions (normalize-query-actions query)
        http-actions (normalize-http-actions http)
        implicit-actions (normalize-implicit-actions implicit)]
    (sort-by :updated_at (concat query-actions http-actions implicit-actions))))

(defn unique-field-slugs?
  "Makes sure that if `coll` is indexed by `index-by`, no keys will be in conflict."
  [fields]
  (empty? (m/filter-vals #(not= % 1) (frequencies (map (comp u/slugify :name) fields)))))

(defn implicit-action-parameters
  "Return a set of parameters for the given models"
  [cards]
  (let [card-by-table-id (into {}
                               (for [card cards
                                     :let [{:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
                                     :when table-id]
                                 [table-id card]))
        tables (when-let [table-ids (seq (keys card-by-table-id))]
                 (hydrate (db/select 'Table :id [:in table-ids]) :fields))]
    (into {}
          (for [table tables
                :let [fields (:fields table)]
                ;; Skip tables for have conflicting slugified columns i.e. table has "name" and "NAME" columns.
                :when (unique-field-slugs? fields)
                :let [card (get card-by-table-id (:id table))
                      exposed-fields (into #{} (keep :id) (:result_metadata card))
                      parameters (->> fields
                                      (filter #(contains? exposed-fields (:id %)))
                                      (map (fn [field]
                                             {:id (u/slugify (:name field))
                                              :target [:variable [:template-tag (u/slugify (:name field))]]
                                              :type (:base_type field)
                                              :required (:database_required field)
                                              ::field-id (:id field)
                                              ::pk? (isa? (:semantic_type field) :type/PK)})))]]
            [(:id card) parameters]))))

(defn actions-with-implicit-params
  "Find actions with given options and generate implicit parameters for execution.

   Pass in known-models to save a second Card lookup."
  [known-models & options]
  (let [actions                         (apply select-actions options)
        implicit-action-model-ids       (set (map :model_id (filter (comp #(= :implicit %) :type) actions)))
        models-with-implicit-actions    (if known-models
                                          (->> known-models
                                               (filter #(contains? implicit-action-model-ids (:id %)))
                                               distinct)
                                          (when (seq implicit-action-model-ids)
                                            (db/select 'Card :id [:in implicit-action-model-ids])))
        implicit-parameters-by-model-id (when (seq models-with-implicit-actions)
                                          (implicit-action-parameters models-with-implicit-actions))]
    (for [{:keys [parameters] :as action} actions
          :let [model-id        (:model_id action)
                implicit-params (when (= (:type action) :implicit)
                                  (let [implicit-params (get implicit-parameters-by-model-id model-id)
                                        saved-params    (m/index-by :id parameters)]
                                    (for [param implicit-params
                                          :let [saved-param (get saved-params (:id param))]]
                                      (merge param saved-param))))]]
      (cond-> action
        implicit-params
        (m/assoc-some :parameters (cond->> implicit-params
                                    (= "row/delete" (:kind action))
                                    (filter ::pk?)

                                    (contains? #{"row/update" "row/delete"} (:kind action))
                                    (map (fn [param] (cond-> param (::pk? param) (assoc :required true))))

                                    :always
                                    (map #(dissoc % ::pk? ::field-id))

                                    :always seq))))))

(mi/define-batched-hydration-method dashcard-action
  :dashcard/action
  "Hydrates action from DashboardCard."
  [dashcards]
  (let [actions-by-id (when-let [action-ids (seq (keep :action_id dashcards))]
                        (m/index-by :id (actions-with-implicit-params (map :card dashcards) :id [:in action-ids])))]
    (for [dashcard dashcards]
      (m/assoc-some dashcard :action (get actions-by-id (:action_id dashcard))))))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes.hash/identity-hash-fields Action
  [_action]
  [:name (serdes.hash/hydrated-hash :model "<none>") :created_at])

(defmethod serdes.hash/identity-hash-fields QueryAction
  [_action]
  [(serdes.hash/hydrated-hash :action "<none>")])

(defmethod serdes.hash/identity-hash-fields ImplicitAction
  [_action]
  [(serdes.hash/hydrated-hash :action "<none>")])

(defmethod serdes.hash/identity-hash-fields HTTPAction
  [_action]
  [(serdes.hash/hydrated-hash :action "<none>")])

(defmethod serdes.base/extract-one "Action"
  [_model-name _opts action]
  (-> (serdes.base/extract-one-basics "Action" action)
      (update :creator_id serdes.util/export-user)
      (update :model_id serdes.util/export-fk 'Card)))

(defmethod serdes.base/load-xform "Action" [action]
  (-> action
      serdes.base/load-xform-basics
      (update :model_id serdes.util/import-fk 'Card)
      (update :creator_id serdes.util/import-fk-keyed 'User :email)))

(defmethod serdes.base/extract-one "QueryAction"
  [_model-name _opts query-action]
  (-> (serdes.base/extract-one-basics "QueryAction" query-action)
      (update :database_id serdes.util/export-fk-keyed 'Database :name)
      (assoc :action_id (serdes.util/export-fk (:action_id query-action) 'Action))))

(defmethod serdes.base/load-xform "QueryAction" [query-action]
  (-> query-action
      serdes.base/load-xform-basics
      (update :database_id serdes.util/import-fk-keyed 'Database :name)
      (update :action_id serdes.util/import-fk 'Action)))

(defmethod serdes.base/extract-one "ImplicitAction"
  [_model-name _opts implicit-action]
  (-> (serdes.base/extract-one-basics "ImplicitAction" implicit-action)
      (assoc :action_id (serdes.util/export-fk (:action_id implicit-action) 'Action))))

(defmethod serdes.base/load-xform "ImplicitAction" [implicit-action]
  (-> implicit-action
      serdes.base/load-xform-basics
      (update :action_id serdes.util/import-fk 'Action)))

(defmethod serdes.base/extract-one "HTTPAction"
  [_model-name _opts http-action]
  (-> (serdes.base/extract-one-basics "HTTPAction" http-action)
      (assoc :action_id (serdes.util/export-fk (:action_id http-action) 'Action))))

(defmethod serdes.base/load-xform "HTTPAction" [http-action]
  (-> http-action
      serdes.base/load-xform-basics
      (update :action_id serdes.util/import-fk 'Action)))

(defmethod serdes.base/serdes-generate-path "Action"
  [_ action]
  (serdes.base/maybe-labeled "Action" action :name))

(defmethod serdes.base/serdes-generate-path "QueryAction"
  [_ action]
  [(assoc (serdes.base/infer-self-path "QueryAction" action) :label "query_action")])

(defmethod serdes.base/serdes-generate-path "ImplicitAction"
  [_ action]
  [(assoc (serdes.base/infer-self-path "ImplicitAction" action) :label "implicit_action")])

(defmethod serdes.base/serdes-generate-path "HTTPAction"
  [_ action]
  [(assoc (serdes.base/infer-self-path "HTTPAction" action) :label "http_action")])

(defmethod serdes.base/serdes-dependencies "Action" [action]
  [[{:model "Card" :id (:model_id action)}]])

(defmethod serdes.base/serdes-dependencies "QueryAction" [query-action]
  [[{:model "Action" :id (:action_id query-action)}]])

(defmethod serdes.base/serdes-dependencies "HTTPAction" [http-action]
  [[{:model "Action" :id (:action_id http-action)}]])

(defmethod serdes.base/serdes-dependencies "ImplicitAction" [implicit-action]
  [[{:model "Action" :id (:action_id implicit-action)}]])

(defmethod serdes.base/storage-path "Action" [action _ctx]
  (let [{:keys [id label]} (-> action serdes.base/serdes-path last)]
    ["actions" (serdes.base/storage-leaf-file-name id label)]))

(defmethod serdes.base/storage-path "QueryAction" [query-action _ctx]
  (let [{:keys [id label]} (-> query-action serdes.base/serdes-path last)]
    ["actions" "query_actions" (serdes.base/storage-leaf-file-name id label)]))

(defmethod serdes.base/storage-path "ImplicitAction" [implicit-action _ctx]
  (let [{:keys [id label]} (-> implicit-action serdes.base/serdes-path last)]
    ["actions" "implicit_actions" (serdes.base/storage-leaf-file-name id label)]))

(defmethod serdes.base/storage-path "HTTPAction" [http-action _ctx]
  (let [{:keys [id label]} (-> http-action serdes.base/serdes-path last)]
    ["actions" "http_actions" (serdes.base/storage-leaf-file-name id label)]))

;; This is coupled to storage-path
;; storage-path converts a serdes path to a storage path.
;; ingestion-path converts a storage path to a serdes path.
(serdes.base/register-ingestion-path!
 "Action"
  ;; ["actions" "my-action"]
 (fn [path]
   (when-let [[id slug] (and (= (first path) "actions")
                             ;; TODO: make action a directory with itself
                             ;; (apply = (take-last 2 path))
                             (serdes.base/split-leaf-file-name (last path)))]
     (cond-> {:model "Action" :id id}
       slug (assoc :label slug)
       true vector))))

(serdes.base/register-ingestion-path!
 "QueryAction"
 ;; ["actions" "query_actions" "my-query-action"]
 (fn [path]
   (when-let [[id slug] (and (= (first path) "actions")
                             (= (second path) "query_actions")
                             (serdes.base/split-leaf-file-name (last path)))]
     (cond-> {:model "QueryAction" :id id}
       slug (assoc :label slug)
       true vector))))

(serdes.base/register-ingestion-path!
 "ImplicitAction"
 ;; ["actions" "implicit_actions" "my-implicit-action"]
 (fn [path]
   (when-let [[id slug] (and (= (first path) "actions")
                             (= (second path) "implicit_actions")
                             (serdes.base/split-leaf-file-name (last path)))]
     (cond-> {:model "ImplicitAction" :id id}
       slug (assoc :label slug)
       true vector))))

(serdes.base/register-ingestion-path!
 "HTTPAction"
 ;; ["actions" "http_actions" "my-http-action"]
 (fn [path]
   (when-let [[id slug] (and (= (first path) "actions")
                             (= (second path) "http_actions")
                             (serdes.base/split-leaf-file-name (last path)))]
     (cond-> {:model "HTTPAction" :id id}
       slug (assoc :label slug)
       true vector))))

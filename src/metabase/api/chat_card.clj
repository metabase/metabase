(ns metabase.api.chat-card
  "/api/chat_card endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.analyze :as analyze]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.query-metadata :as api.query-metadata]
   [metabase.compatibility :as compatibility]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.chat-card :as chat-card]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.models.params :as params]
   [metabase.models :refer [ChatCard CardBookmark Collection Database
                            PersistedInfo Table]]

   [metabase.models.query :as query]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.models.timeline :as timeline]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor.chat_card :as qp.card]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))


(set! *warn-on-reflection* true)
(def ^:private order-by-name {:order-by [[:%lower.name :asc]]})

(defn- db-id-via-table
  [model model-id]
  (t2/select-one-fn :db_id :model/Table {:select [:t.db_id]
                                         :from [[:metabase_table :t]]
                                         :join [[model :m] [:= :t.id :m.table_id]]
                                         :where [:= :m.id model-id]}))

(defmulti ^:private cards-for-filter-option*
  {:arglists '([filter-option & args])}
  (fn [filter-option & _]
    (keyword filter-option)))

;; return all Cards. This is the default filter option.
(defmethod cards-for-filter-option* :all
  [_]
  (t2/select ChatCard, :archived false, order-by-name))

;; return Cards created by the current user
(defmethod cards-for-filter-option* :mine
  [_]
  (t2/select ChatCard, :creator_id api/*current-user-id*, :archived false, order-by-name))

;; return all Cards bookmarked by the current user.
(defmethod cards-for-filter-option* :bookmarked
  [_]
  (let [bookmarks (t2/select [CardBookmark :card_id] :user_id api/*current-user-id*)]
    (->> (t2/hydrate bookmarks :chat_card)
         (map :chat_card)
         (remove :archived)
         (sort-by :name))))

;; Return all Cards belonging to Database with `database-id`.
(defmethod cards-for-filter-option* :database
  [_ database-id]
  (t2/select ChatCard, :database_id database-id, :archived false, order-by-name))

;; Return all Cards belonging to `Table` with `table-id`.
(defmethod cards-for-filter-option* :table
  [_ table-id]
  (t2/select ChatCard, :table_id table-id, :archived false, order-by-name))

;; Cards that have been archived.
(defmethod cards-for-filter-option* :archived
  [_]
  (t2/select ChatCard, :archived true, order-by-name))

;; Cards that are using a given model.
(defmethod cards-for-filter-option* :using_model
  [_filter-option model-id]
  (->> (t2/select ChatCard {:select [:c.*]
                        :from [[:report_card :m]]
                        :join [[:report_card :c] [:and
                                                  [:= :c.database_id :m.database_id]
                                                  [:or
                                                   [:like :c.dataset_query (format "%%card__%s%%" model-id)]
                                                   [:like :c.dataset_query (format "%%#%s%%" model-id)]]]]
                        :where [:and [:= :m.id model-id] [:not :c.archived]]
                        :order-by [[[:lower :c.name] :asc]]})
       ;; now check if model-id really occurs as a card ID
       (filter (fn [card] (some #{model-id} (-> card :dataset_query query/collect-card-ids))))))

(defn- cards-for-segment-or-metric
  [model-type model-id]
  (->> (t2/select :model/ChatCard (merge order-by-name
                                     {:where [:like :dataset_query (str "%" (name model-type) "%" model-id "%")]}))
       ;; now check if the segment/metric with model-id really occurs in a filter/aggregation expression
       (filter (fn [card]
                 (when-let [query (some-> card :dataset_query lib.convert/->pMBQL)]
                   (case model-type
                     :segment (lib/uses-segment? query model-id)
                     :metric  (lib/uses-metric? query model-id)))))))

(defmethod cards-for-filter-option* :using_metric
  [_filter-option model-id]
  (cards-for-segment-or-metric :metric model-id))

(defmethod cards-for-filter-option* :using_segment
  [_filter-option model-id]
  (cards-for-segment-or-metric :segment model-id))

(defn- cards-for-filter-option [filter-option model-id-or-nil]
  (-> (apply cards-for-filter-option* filter-option (when model-id-or-nil [model-id-or-nil]))
      (t2/hydrate :creator :collection)))
(def ^:private card-filter-options
  "a valid card filter option."
  (map name (keys (methods cards-for-filter-option*))))
;;; -------------------------------------------- Fetching a ChatCard or ChatCards --------------------------------------------

(api/defendpoint GET "/"
  "Get all the Cards. Optionally filter by `database_id` to return only id, name, description, dataset_query, and visualization_settings 
   for the 100 most recent cards by `created_at`."
  [f model_id database_id]
  {f           [:maybe (into [:enum] card-filter-options)]
   model_id    [:maybe ms/PositiveInt]
   database_id [:maybe ms/PositiveInt]}
  (let [f (or (keyword f) :all)]
    (when (contains? #{:database :table :using_model :using_metric :using_segment} f)
      (api/checkp (integer? model_id) "model_id" (format "model_id is a required parameter when filter mode is '%s'"
                                                         (name f)))
      (case f
        :database      (api/read-check Database model_id)
        :table         (api/read-check Database (t2/select-one-fn :db_id Table, :id model_id))
        :using_model   (api/read-check ChatCard model_id)
        :using_metric  (api/read-check Database (db-id-via-table :metric model_id))
        :using_segment (api/read-check Database (db-id-via-table :segment model_id))))
    (let [cards (if database_id
                  (->> (cards-for-filter-option :database database_id)
                       (sort-by :created_at #(compare %2 %1))  ;; Orden descendente
                       (take 100)                             ;; Limitar a 100
                       (map #(select-keys % [:id :name :description :dataset_query :visualization_settings]))
                       (into []))
                  (let [cards (filter mi/can-read? (cards-for-filter-option f model_id))
                        last-edit-info (:chat_card (last-edit/fetch-last-edited-info {:card-ids (map :id cards)}))]
                    (into []
                          (map (fn [{:keys [id] :as card}]
                                 (if-let [edit-info (get last-edit-info id)]
                                   (assoc card :last-edit-info edit-info)
                                   card)))
                          cards)))]
      cards)))


(defn hydrate-card-details
  "Adds additional information to a `Card` selected with toucan that is needed by the frontend. This should be the same information
  returned by all API endpoints where the card entity is cached (i.e. GET, PUT, POST) since the frontend replaces the Card
  it currently has with returned one -- See #4283"
  [{card-id :id :as chat_card}]
  (span/with-span!
    {:name       "hydrate-card-details"
     :attributes {:chat-card/id card-id}}
    (-> chat_card
        (t2/hydrate :based_on_upload
                    :creator
                    :dashboard_count
                    :can_write
                    :can_run_adhoc_query
                    :average_query_time
                    :last_query_start
                    :parameter_usage_count
                    :can_restore
                    :can_delete
                    [:collection :is_personal]
                    [:moderation_reviews :moderator_details])
        (cond->                                             ; card
          (chat-card/chat-model? chat_card) (t2/hydrate :persisted)))))

(defn get-chat-card
  "Get `ChatCard` with ID."
  [id]
  (let [with-last-edit-info #(first (last-edit/with-last-edit-info [%] :chat_card))
        raw-chat-card (t2/select-one ChatCard :id id)]
    (-> raw-chat-card
        api/read-check
        hydrate-card-details
        with-last-edit-info
        collection.root/hydrate-root-collection
        (api/present-in-trash-if-archived-directly (collection/trash-collection-id)))))

(api/defendpoint GET "/:id"
  "Get `ChatCard` with ID."
  [id ignore_view context]
  {id ms/PositiveInt
   ignore_view [:maybe :boolean]
   context [:maybe [:enum :collection]]}
  (let [chat-card (get-chat-card id)]
    (u/prog1 chat-card
      (when-not ignore_view
        (events/publish-event! :event/card-read
                               {:object-id (:id <>)
                                :user-id api/*current-user-id*
                                :context (or context :question)})))))

(mr/def ::chat-card-type
  (into [:enum {:decode/json keyword}] (mapcat (juxt identity u/qualified-name)) chat-card/chat-card-types))

;;; ------------------------------------------------- Creating Chat Cards -------------------------------------------------

(api/defendpoint POST "/"
  "Create a new `ChatCard`."
  [:as {{:keys [collection_id collection_position dataset_query description display name
                parameters parameter_mappings result_metadata visualization_settings cache_ttl type], :as body} :body}]
  {name                   ms/NonBlankString
   type                   [:maybe ::chat-card-type]
   dataset_query          ms/Map
   parameters             [:maybe [:sequential ms/Parameter]]
   parameter_mappings     [:maybe [:sequential ms/ParameterMapping]]
   description            [:maybe ms/NonBlankString]
   display                ms/NonBlankString
   visualization_settings ms/Map
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   result_metadata        [:maybe analyze/ResultsMetadata]
   cache_ttl              [:maybe ms/PositiveInt]}

  (let [body (cond-> body
               (string? (:type body)) (update :type keyword))]
    (-> (chat-card/create-chat-card! body @api/*current-user*)
        (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))

;;; ------------------------------------------------ Running a Query -------------------------------------------------

(api/defendpoint POST "/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache dashboard_id collection_preview], :or {ignore_cache false dashboard_id nil}} :body}]
  {card-id            ms/PositiveInt
   ignore_cache       [:maybe :boolean]
   collection_preview [:maybe :boolean]
   dashboard_id       [:maybe ms/PositiveInt]}

  (try
    (let [result (qp.card/process-query-for-card
                   card-id :api
                   :parameters   parameters
                   :ignore-cache ignore_cache
                   :dashboard-id dashboard_id
                   :context      (if collection_preview :collection :question)
                   :middleware   {:process-viz-settings? false})]
      
      (println "Consulta ejecutada exitosamente. Resultado:" result)
      result)
    
    (catch Exception e
      (println "Error al procesar la consulta para card-id:" card-id)
      (println "Mensaje de error:" (.getMessage e))
      (throw e))))



(api/define-routes)
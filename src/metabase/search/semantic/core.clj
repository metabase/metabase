(ns metabase.search.semantic.core
  "Semantic search engine implementation."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.request.core :as request]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.permissions :as search.permissions]
   [metabase.search.semantic.index :as semantic.index]
   [metabase.settings.models.setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(def ^:private external-index-base-url
  "http://localhost:3003/api/")

;;; ---------------------------------------- Engine Registration ----------------------------------------

(defsetting semantic-search-enabled
  "Whether to enable semantic search. If enabled, the engine will be available for use."
  :type :boolean
  :default true
  :visibility :internal
  :description "Enable semantic search engine.")

(def supported-db?
  "All the databases which we have implemented semantic search for."
  #{:postgres})

(defmethod search.engine/supported-engine? :search.engine/semantic [_]
  (boolean
   (and (supported-db? (app-db/db-type))
        (semantic-search-enabled))))

;;; ---------------------------------------- Search Implementation ----------------------------------------

(defn- fetch-query-embedding
  "Fetch embedding for the search query from the local model."
  [search-string]
  (when-not (str/blank? search-string)
    (try
      (let [response (http/post "http://localhost:11434/api/embeddings"
                                {:headers {"Content-Type" "application/json"}
                                 :body    (json/encode {:model "mxbai-embed-large"
                                                        :prompt search-string})})
            embedding (-> (json/decode (:body response) true) :embedding)]
        (str "[" (str/join ", " embedding) "]"))
      (catch Exception e
        (log/error e "Failed to fetch embedding for query:" search-string)
        nil))))

(defn- parse-datetime [s]
  (when s (OffsetDateTime/parse s)))

(defn- collapse-id [{:keys [id] :as row}]
  (assoc row :id (if (number? id) id (parse-long (last (str/split (:id row) #":"))))))

(defn- rehydrate [index-row]
  (-> (json/decode+kw (:legacy_input index-row))
      collapse-id
      (assoc :score (:distance index-row 1.0))
      (update :created_at parse-datetime)
      (update :updated_at parse-datetime)
      (update :last_edited_at parse-datetime)))

(defn- add-table-where-clauses
  "Add a `WHERE` clause to the query to only return tables the current user has access to"
  [search-ctx qry]
  (sql.helpers/where qry
                     [:or
                      [:= :search_index.model nil]
                      [:!= :search_index.model [:inline "table"]]
                      [:and
                       [:= :search_index.model [:inline "table"]]
                       [:exists {:select [1]
                                 :from   [[:metabase_table :mt_toplevel]]
                                 :where  [:and [:= :mt_toplevel.id [:cast :search_index.model_id :integer]]
                                          (search.permissions/permitted-tables-clause search-ctx :mt_toplevel.id)]}]]]))

(defn- add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [search-ctx qry]
  (if api/*current-user-id*
    (let [collection-id-col :search_index.collection_id
          permitted-clause  (search.permissions/permitted-collections-clause search-ctx collection-id-col)
          personal-clause   (search.filter/personal-collections-where-clause search-ctx collection-id-col)
          excluded-models   (search.filter/models-without-collection)
          or-null           #(vector :or [:in :search_index.model excluded-models] %)]
      (cond-> qry
        true (sql.helpers/left-join [:collection :collection] [:= collection-id-col :collection.id])
        true (sql.helpers/where (or-null permitted-clause))
        personal-clause (sql.helpers/where (or-null personal-clause))))
    qry))

(defn- semantic-search-query
  "Build a semantic search query using vector similarity."
  [search-string search-ctx]
  (when-let [active-table (semantic.index/active-table)]
    (if-let [query-embedding (fetch-query-embedding search-string)]
      {:select [:search_index.model_id
                :search_index.model
                :search_index.legacy_input
                [[:raw (str "embedding <=> '" query-embedding "'::vector")] :distance]]
       :from   [[active-table :search_index]]
       :order-by [[:distance :asc]]
       :limit  100}
      ;; Fallback to simple query without vector similarity if embedding fetch fails
      {:select [:search_index.model_id
                :search_index.model
                :search_index.legacy_input
                [[:inline 1.0] :distance]]
       :from   [[active-table :search_index]]
       :limit  100})))

(defmethod search.engine/results :search.engine/semantic
  [{:keys [search-string] :as search-ctx}]
  (try
    (let [response (http/post (str external-index-base-url "query")
                              {:headers {"Content-Type" "application/json"}
                               :body    (json/encode {:query search-string})})
          status (:status response)]
      (if (= 200 status)
        (let [results (-> (json/decode (:body response) true)
                          :results)]
          (map (fn [result]
                 (-> result
                     (update :created_at parse-datetime)
                     (update :updated_at parse-datetime)
                     (update :last_edited_at parse-datetime)))
               results))
        (throw (ex-info "External semantic search service query failed"
                        {:status status
                         :response response}))))
    (catch Exception e
      (log/error e "Failed to query semantic search service")
      (throw e))))

(comment
  (request/as-admin
    (search.engine/results {:search-string "how many chairs are in stock?"
                            :search-engine :search.engine/semantic})))

(defmethod search.engine/model-set :search.engine/semantic
  [search-ctx]
  ;; TODO: Return set of models that have results for the query
  (log/info "Semantic search model-set called with context:" search-ctx)
  #{})

(defmethod search.engine/score :search.engine/semantic
  [search-ctx result]
  ;; TODO: Implement semantic scoring logic
  {:result (dissoc result :score)
   :score  1})

;;; ---------------------------------------- Index Management ----------------------------------------

(defn populate-external-index!
  "Populate the external semantic search index with all searchable documents."
  []
  (try
    (let [documents (into [] (search.ingestion/searchable-documents))
          response (http/post (str external-index-base-url "populate")
                              {:headers {"Content-Type" "application/json"}
                               :body    (json/encode {:documents documents})})
          status (:status response)]
      (if (= 200 status)
        (do
          (log/info "Successfully populated semantic search index with" (count documents) "documents")
          {:status :success :document-count (count documents)})
        (throw (ex-info "External semantic search service populate failed"
                        {:status status
                         :response response}))))
    (catch Exception e
      (log/error e "Failed to populate semantic search index")
      (throw e))))

(defmethod search.engine/update! :search.engine/semantic
  [_engine document-reducible]
  (try
    (let [documents (into [] document-reducible)
          response (http/put (str external-index-base-url "update")
                             {:headers {"Content-Type" "application/json"}
                              :body    (json/encode {:documents documents})})
          status (:status response)]
      (if (= 200 status)
        (do
          (log/info "Successfully updated semantic search index with" (count documents) "documents")
          (->> documents (map :model) frequencies))
        (throw (ex-info "External semantic search service update failed"
                        {:status status
                         :response response}))))
    (catch Exception e
      (log/error e "Failed to update semantic search index")
      (throw e))))

(defmethod search.engine/delete! :search.engine/semantic
  [_engine model ids]
  (try
    (let [response (http/delete (str external-index-base-url "delete")
                                {:headers {"Content-Type" "application/json"}
                                 :body    (json/encode {:model model :ids ids})})
          status (:status response)]
      (if (= 200 status)
        (do
          (log/info "Successfully deleted documents from semantic search index for model:" model "ids:" ids)
          {model (count ids)})
        (throw (ex-info "External semantic search service delete failed"
                        {:status status
                         :response response}))))
    (catch Exception e
      (log/error e "Failed to delete documents from semantic search index")
      (throw e))))

(defmethod search.engine/init! :search.engine/semantic
  [_engine _opts]
  (try
    (let [response (http/post (str external-index-base-url "init")
                              {:headers {"Content-Type" "application/json"}
                               :body    (json/encode {:force-reset? true})})
          status   (:status response)]
      (if (= 200 status)
        (do
          (log/info "Successfully initialized semantic search service")
          (populate-external-index!))
        (throw (ex-info "External semantic search service initialization failed"
                        {:status status
                         :response response}))))
    (catch Exception e
      (log/error e "Failed to initialize semantic search service")
      (throw e))))

(comment
  (search.engine/init! :search.engine/semantic
                       {:re-populate? true}))

(defmethod search.engine/reindex! :search.engine/semantic
  [_ {:keys [in-place?]}]
  (semantic.index/ensure-ready!)
  (if in-place?
    (when-let [table (semantic.index/active-table)]
      ;; keep the current table, just delete its contents
      (t2/delete! table))
    (semantic.index/maybe-create-pending!))
  (u/prog1 (semantic.index/populate-index! (if in-place? :search/updating :search/reindexing))
    (semantic.index/activate-table!)))

(defmethod search.engine/reset-tracking! :search.engine/semantic [_]
  ;; TODO: Reset any internal tracking state
  (log/info "Semantic search reset-tracking called"))

(ns metabase.search.semantic.core
  "Semantic search engine implementation. Wraps calls to an external semantic search service."
  (:require
   [clj-http.client :as http]
   [metabase.config.core :as config]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.settings :as search.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Engine Registration ----------------------------------------

(defmethod search.engine/supported-engine? :search.engine/semantic [_]
  (or (not config/is-prod?)
      (= :semantic (search.settings/search-engine))))

;;; ---------------------------------------- HTTP Helper -----------------------------------------------

(defn- semantic-search-request!
  "Make an HTTP request to the semantic search service."
  [method endpoint payload]
  (try
    (let [url (str (search.settings/semantic-search-base-url) endpoint)
          request-fn (case method
                       :get http/get
                       :post http/post
                       :put http/put
                       :delete http/delete)
          response (request-fn url {:headers {"Content-Type" "application/json"}
                                    :body (json/encode payload)})
          status (:status response)]
      (if (= 200 status)
        (:body response)
        (throw (ex-info (str "Semantic search service " endpoint " request failed")
                        {:status status
                         :response response}))))
    (catch Exception e
      (log/error e "Failed to make semantic search request to" endpoint)
      (throw e))))

;;; ---------------------------------------- Search Implementation --------------------------------------

(defn- parse-datetime [s]
  (when s (OffsetDateTime/parse s)))

(defmethod search.engine/results :search.engine/semantic
  [{:keys [search-string]}]
  (let [response-body (semantic-search-request! :post "query" {:query search-string})
        results (-> (json/decode response-body true) :results)]
    (map (fn [result]
           (-> result
               (update :created_at parse-datetime)
               (update :updated_at parse-datetime)
               (update :last_edited_at parse-datetime)))
         results)))

;; TODO
(defmethod search.engine/model-set :search.engine/semantic
  [_search-ctx]
  ;; TODO: Return set of models that have results for the query
  (log/info "Semantic search model-set called")
  #{})

(defmethod search.engine/score :search.engine/semantic
  [_search-ctx result]
  ;; TODO: Implement semantic scoring logic
  {:result (dissoc result :score)
   :score  1})

;;; ---------------------------------------- Index Management ----------------------------------------

(defn populate-external-index!
  "Populate the external semantic search index with all searchable documents."
  []
  (let [documents (into [] (search.ingestion/searchable-documents))]
    (semantic-search-request! :post "populate" {:documents documents})
    (log/info "Successfully populated semantic search index with" (count documents) "documents")
    {:status :success :document-count (count documents)}))

(defmethod search.engine/update! :search.engine/semantic
  [_engine document-reducible]
  (let [documents (into [] document-reducible)]
    (semantic-search-request! :put "update" {:documents documents})
    (log/info "Successfully updated semantic search index with" (count documents) "documents")
    (->> documents (map :model) frequencies)))

(defmethod search.engine/delete! :search.engine/semantic
  [_engine model ids]
  (semantic-search-request! :delete "delete" {:model model :ids ids})
  (log/info "Successfully deleted documents from semantic search index for model:" model "ids:" ids)
  {model (count ids)})

(defmethod search.engine/init! :search.engine/semantic
  [_engine _opts]
  (semantic-search-request! :post "init" {:force-reset? false})
  (log/info "Successfully initialized semantic search service")
  (populate-external-index!))

(defmethod search.engine/reindex! :search.engine/semantic
  [_ _opts]
  (semantic-search-request! :post "init" {:force-reset? true})
  (log/info "Reindexing semantic search service")
  (populate-external-index!))

;; TODO
(defmethod search.engine/reset-tracking! :search.engine/semantic [_]
  (log/info "Semantic search reset-tracking called"))

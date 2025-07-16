(ns metabase.search.semantic.core
  "Semantic search engine implementation. Wraps calls to an external semantic search service."
  (:require
   [clj-http.client :as http]
   [metabase.config.core :as config]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.settings :as search.settings]
   [metabase.util :as u]
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

(defn- build-search-payload
  "Build the payload for the semantic search request."
  [search-ctx]
  (let [payload (select-keys search-ctx
                             [:search-string :archived? :models :created-at :created-by :last-edited-at :last-edited-by])]
    (cond-> payload
      (:created-at payload)
      (update :created-at #(some-> % (params.dates/date-string->range {:inclusive-end? false})))

      (:last-edited-at payload)
      (update :last-edited-at #(some-> % (params.dates/date-string->range {:inclusive-end? false}))))))

(defmethod search.engine/results :search.engine/semantic
  [search-ctx]
  (let [payload       (build-search-payload search-ctx)
        response-body (semantic-search-request! :post "query" payload)
        results       (-> (json/decode response-body true) :results)]
    (map (fn [result]
           (-> result
               (update :created_at parse-datetime)
               (update :updated_at parse-datetime)
               (update :last_edited_at parse-datetime)))
         results)))

(defmethod search.engine/model-set :search.engine/semantic
  [_search-ctx]
  ;; TODO: Do we need to fetch the model set from the external service?
  search.config/all-models)

(defmethod search.engine/score :search.engine/semantic
  [_search-ctx result]
  ;; TODO: Implement semantic scoring logic
  {:result (dissoc result :score)
   :score  1})

;;; ---------------------------------------- Index Management ----------------------------------------

;; TODO experiment to determine a good batch size. This was copied
;; from [[metabase.search.appdb.index/insert-batch-size]].
(def ^:private populate-external-batch-size 150)

(defn- populate-external-index-batch!
  "Populate the external semantic search index with a single batch of searchable documents."
  [documents]
  (semantic-search-request! :post "populate" {:documents documents})
  (u/prog1 (->> documents (map :model) frequencies)
    (log/trace "semantic search indexed a batch of" (count documents) "documents with frequencies" <>)))

(defn- populate-external-index!
  "Populate the external semantic search index with all searchable documents."
  []
  ;; TODO this needs better handling of failures. If one batch request fails, should we continue, or give up and try
  ;; again with backoff? The semantic search service should also be updated to maintain separate :active / :pending
  ;; indexes, similar to the appdb backend. It probably makes sense to have a new API call pair that bookends this
  ;; batch of requests: POST reindex-start / reindex-stop to let the remote know we're starting / stopping a batch.
  (let [model-frequencies (transduce (comp (partition-all populate-external-batch-size)
                                           (map populate-external-index-batch!))
                                     (partial merge-with +)
                                     (search.ingestion/searchable-documents))
        document-count (reduce + (vals model-frequencies))]
    (log/info "Successfully populated semantic search index with" document-count
              "total documents with frequencies" model-frequencies)
    {:status :success :document-count document-count}))

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
  ;; TODO: -- handle existing indexes instead of always resetting
  (semantic-search-request! :post "init" {:force-reset? true})
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

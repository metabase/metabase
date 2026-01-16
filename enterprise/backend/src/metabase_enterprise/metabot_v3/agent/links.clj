(ns metabase-enterprise.metabot-v3.agent.links
  "Link resolution for metabase:// URIs in streaming text.
  Converts internal metabase:// links to proper Metabase URLs using agent memory state."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; Link Types

(def ^:private link-type-paths
  "Map of metabase:// link types to their URL paths."
  {"model"     "/model"
   "metric"    "/metric"
   "dashboard" "/dashboard"
   "question"  "/question"
   "transform" "/admin/transforms"})

;;; Query/Chart URL Generation

(defn- query->url-hash
  "Convert an MBQL query to a base64-encoded URL hash for /question# URLs."
  [query]
  (let [dataset-query (if (and (map? query) (:lib/type query))
                        (lib/->legacy-MBQL query)
                        query)]
    (-> {:dataset_query dataset-query}
        json/encode
        (.getBytes "UTF-8")
        codecs/bytes->b64-str)))

(defn- resolve-query-link
  "Resolve a metabase://query/{id} link to a /question# URL."
  [query-id queries-state]
  (if-let [query (get queries-state query-id)]
    (str "/question#" (query->url-hash query))
    (do
      (log/warn "Query not found for link resolution" {:query-id query-id
                                                       :available (keys queries-state)})
      nil)))

(defn- resolve-chart-link
  "Resolve a metabase://chart/{id} link to a proper URL.
  Charts contain visualization settings and reference queries.
  Falls back to treating the ID as a query ID if no chart is found
  (handles LLM mistakes where it uses chart/ instead of query/)."
  [chart-id charts-state queries-state]
  (if-let [chart (get charts-state chart-id)]
    ;; Chart has a query-id that points to the actual query
    (let [query-id (:query-id chart)]
      (if-let [query (get queries-state query-id)]
        (str "/question#" (query->url-hash query))
        (do
          (log/warn "Query not found for chart" {:chart-id chart-id
                                                 :query-id query-id})
          nil)))
    ;; Chart not found - fall back to checking if it's actually a query ID
    ;; (LLM sometimes uses metabase://chart/ when it should use metabase://query/)
    (if-let [query (get queries-state chart-id)]
      (do
        (log/debug "Treating chart link as query link" {:id chart-id})
        (str "/question#" (query->url-hash query)))
      (do
        (log/warn "Chart not found for link resolution" {:chart-id chart-id
                                                         :available-charts (keys charts-state)
                                                         :available-queries (keys queries-state)})
        nil))))

(defn- resolve-entity-link
  "Resolve a metabase://{type}/{id} link to a proper URL."
  [entity-type entity-id]
  (if-let [path (get link-type-paths entity-type)]
    (str path "/" entity-id)
    (do
      (log/warn "Unknown entity type for link" {:type entity-type :id entity-id})
      nil)))

;;; Main Link Resolution

(defn resolve-metabase-uri
  "Resolve a metabase:// URI to a proper Metabase URL.

  Supported URI formats:
  - metabase://query/{uuid} - Links to query results
  - metabase://chart/{uuid} - Links to chart visualizations
  - metabase://question/{uuid} - Links to saved questions
  - metabase://model/{id} - Links to models
  - metabase://metric/{id} - Links to metrics
  - metabase://dashboard/{id} - Links to dashboards
  - metabase://table/{id} - Links to tables (as questions)
  - metabase://transform/{id} - Links to transforms

  Returns the resolved URL or nil if resolution fails."
  [uri queries-state charts-state]
  (when (and uri (str/starts-with? uri "metabase://"))
    (let [path (subs uri 11) ; Remove "metabase://"
          [entity-type entity-id] (str/split path #"/" 2)]
      (case entity-type
        "query"    (resolve-query-link entity-id queries-state)
        "chart"    (resolve-chart-link entity-id charts-state queries-state)
        "question" (resolve-entity-link "question" entity-id)
        ;; For other types, use simple path mapping
        (resolve-entity-link entity-type entity-id)))))

;;; Markdown Link Processing

(defn- find-markdown-links
  "Find all markdown links in text. Returns seq of [full-match link-text url]."
  [text]
  (when (string? text)
    (re-seq #"\[([^\]]*)\]\(([^)]+)\)" text)))

(defn process-text-links
  "Process all metabase:// links in text, replacing them with resolved URLs.

  Takes text containing markdown links like [Chart](metabase://chart/uuid)
  and replaces the URLs with proper Metabase URLs.

  Returns the text with all resolvable links replaced."
  [text queries-state charts-state]
  (if-let [links (find-markdown-links text)]
    (reduce
     (fn [txt [full-match link-text url]]
       (if (and url (str/starts-with? url "metabase://"))
         (if-let [resolved-url (resolve-metabase-uri url queries-state charts-state)]
           (str/replace txt full-match (str "[" link-text "](" resolved-url ")"))
           ;; If resolution fails, keep original (or just show link text)
           txt)
         txt))
     text
     links)
    text))

;;; Part Processing

(defn process-part-links
  "Process metabase:// links in a part's text content.

  For :text parts, processes the text to resolve metabase:// links.
  For other part types, returns unchanged."
  [part queries-state charts-state]
  (if (and (= (:type part) :text) (:text part))
    (update part :text process-text-links queries-state charts-state)
    part))

(defn process-parts-links
  "Process metabase:// links in all parts.
  Returns parts with all text links resolved."
  [parts queries-state charts-state]
  (mapv #(process-part-links % queries-state charts-state) parts))

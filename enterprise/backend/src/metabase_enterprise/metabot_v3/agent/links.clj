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
  ;; Frontend /question# URLs require legacy MBQL format
  #_{:clj-kondo/ignore [:discouraged-var]}
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

(defn- resolve-table-link
  "Resolve a metabase://table/{id} link to a table page URL.
  Note: This differs from ai-service (which links to /question#... by fetching database_id).
  We avoid a DB lookup during streaming by linking directly to the table."
  [table-id]
  (let [parsed-id (cond
                    (int? table-id) table-id
                    (string? table-id) (when (re-matches #"\d+" table-id)
                                         (parse-long table-id))
                    :else nil)]
    (if-not parsed-id
      (do
        (log/warn "Invalid table id for link resolution" {:table-id table-id})
        nil)
      (str "/table/" parsed-id))))

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
      (when-not (or (str/blank? entity-type) (str/blank? entity-id))
        (case entity-type
          "query"    (resolve-query-link entity-id queries-state)
          "chart"    (resolve-chart-link entity-id charts-state queries-state)
          "question" (resolve-entity-link "question" entity-id)
          "table"    (resolve-table-link entity-id)
          ;; For other types, use simple path mapping
          (resolve-entity-link entity-type entity-id))))))

;;; Markdown Link Processing

(def link-pattern
  "Regex matching a complete markdown link [text](url)."
  #"\[([^\[\]]*)\]\(([^()]*)\)")

(defn resolve-links
  "Resolve all metabase:// links in text, replacing them with proper URLs.

  Takes text containing markdown links like [Chart](metabase://chart/uuid)
  and replaces metabase:// URLs with proper Metabase URLs.
  Non-metabase:// links are preserved unchanged.

  Returns the text with all resolvable links replaced."
  [text queries-state charts-state]
  (when (string? text)
    (str/replace text link-pattern
                 (fn [[_ link-text url]]
                   (if (str/starts-with? url "metabase://")
                     (if-let [resolved (resolve-metabase-uri url queries-state charts-state)]
                       (str "[" link-text "](" resolved ")")
                       (do
                         (log/warn "Failed to resolve link URL" {:url url})
                         link-text))
                     (str "[" link-text "](" url ")"))))))

(defn resolve-links-xf
  "Transducer that resolves metabase:// links in text parts.

  Takes queries-state and charts-state for link resolution.
  For :text parts, resolves metabase:// links to proper URLs.
  For other part types, passes through unchanged."
  [queries-state charts-state]
  (map (fn [part]
         (if (and (= (:type part) :text) (:text part))
           (update part :text resolve-links queries-state charts-state)
           part))))

;;; Part Processing (deprecated, use resolve-links-xf)

(defn process-part-links
  "Process metabase:// links in a part's text content.

  For :text parts, processes the text to resolve metabase:// links.
  For other part types, returns unchanged.

  Deprecated: Use resolve-links-xf transducer instead."
  [part queries-state charts-state]
  (if (and (= (:type part) :text) (:text part))
    (update part :text resolve-links queries-state charts-state)
    part))

(defn process-parts-links
  "Process metabase:// links in all parts.
  Returns parts with all text links resolved.

  Deprecated: Use resolve-links-xf transducer instead."
  [parts queries-state charts-state]
  (into [] (resolve-links-xf queries-state charts-state) parts))

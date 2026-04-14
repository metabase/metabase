(ns metabase.metabot.agent.links
  "Link resolution for metabase:// URIs in streaming text.
  Converts internal metabase:// links to proper Metabase URLs using agent memory state."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; Link Types

(def ^:private link-type-paths
  "Map of metabase:// link types to their URL paths."
  {"model"     "/model"
   "metric"    "/metric"
   "dashboard" "/dashboard"
   "question"  "/question"
   "transform" "/data-studio/transforms"})

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

(defn pseudo-card->link
  "Convert map with relevant card keys into a link. Relevant keys are e.g. dataset_query, display, displayIsLocked."
  [pc]
  (str "/question#"
       (-> pc
           json/encode
           (.getBytes "UTF-8")
           codecs/bytes->b64-str)))

(defn query-and-viz-link
  "Generate a question link for query and chart type. Chart type"
  [query chart-type]
  (pseudo-card->link
   {:dataset_query query
    :displayIsLocked true
    :display (keyword chart-type)}))

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

(def ^:private resolve-table-link
  "Resolve a metabase://table/{id} link to an ad-hoc question URL.
  Looks up the table's database_id and generates a /question#<base64> URL
  with a query using that table as the source table.

  Results are cached for 10 minutes."
  (memoize/ttl
   (fn [table-id]
     (let [parsed-id (cond
                       (int? table-id)    table-id
                       (string? table-id) (parse-long table-id)
                       :else              nil)]
       (if-not parsed-id
         (do
           (log/warn "Invalid table id for link resolution" {:table-id table-id})
           nil)
         (if-let [db-id (t2/select-one-fn :db_id :model/Table :id parsed-id)]
           (let [mp    (lib-be/application-database-metadata-provider db-id)
                 table (lib.metadata/table mp parsed-id)
                 query (lib/query mp table)]
             (str "/question#" (query->url-hash query)))
           (do
             (log/warn "Table not found for link resolution" {:table-id parsed-id})
             nil)))))
   :ttl/threshold (u/minutes->ms 10)))

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

  `link-registry-atom` is an atom of {resolved-url original-metabase-uri}.
  Every successful resolution is recorded so that resolved URLs can later be
  inverted back to metabase:// URIs (see [[invert-links]]).

  Returns the text with all resolvable links replaced."
  [text queries-state charts-state link-registry-atom]
  (when (string? text)
    (str/replace text link-pattern
                 (fn [[_ link-text url]]
                   (if (str/starts-with? url "metabase://")
                     (if-let [resolved (resolve-metabase-uri url queries-state charts-state)]
                       (do
                         (swap! link-registry-atom assoc resolved url)
                         (str "[" link-text "](" resolved ")"))
                       (do
                         (log/warn "Failed to resolve link URL" {:url url})
                         link-text))
                     (str "[" link-text "](" url ")"))))))

;;; Link Inversion

(defn- invert-matched-links
  "Replace resolved URLs with original metabase:// URIs using pattern matching.
  `match->url` extracts the URL from a regex match.
  `rebuild` reconstructs the link syntax given [match-groups original-uri]."
  [text pattern match->url rebuild registry-map]
  (if (or (not (string? text))
          (empty? text)
          (empty? registry-map))
    text
    (str/replace text pattern
                 (fn [match]
                   (if-let [original (get registry-map (match->url match))]
                     (rebuild match original)
                     (first match))))))

(defn invert-links
  "Replace resolved URLs with their original metabase:// URIs.

  Only replaces URLs that appear inside `[text](url)` markdown syntax.
  `registry-map` is a map of {resolved-url original-metabase-uri}.

  Returns `text` unchanged if `registry-map` is empty or nil."
  [text registry-map]
  (invert-matched-links text
                        link-pattern
                        (fn [[_ _ url]] url)
                        (fn [[_ link-text _] original]
                          (str "[" link-text "](" original ")"))
                        registry-map))

;;; Slack Link Processing

(def slack-link-pattern
  "Regex matching a complete Slack-format link <metabase://type/id|text>."
  #"<(metabase://[^>|]+)(?:\|([^>]*))?>")

(defn- resolve-slack-link
  "Resolve a single Slack-format metabase:// link match. Returns the replacement string."
  [queries charts link-registry-atom [_ url link-text]]
  (if-let [resolved (resolve-metabase-uri url queries charts)]
    (let [absolute-url (str (system/site-url) resolved)]
      (swap! link-registry-atom assoc absolute-url url)
      (if link-text
        (str "<" absolute-url "|" link-text ">")
        (str "<" absolute-url ">")))
    (do
      (log/warn "Failed to resolve Slack link URL" {:url url})
      (or link-text url))))

(defn resolve-slack-links
  "Resolve all Slack-format metabase:// links in text.

  `link-registry-atom` is an atom of {absolute-url original-metabase-uri}.
  Every successful resolution is recorded so that resolved URLs can later
  be inverted back to metabase:// URIs (see [[invert-slack-links]])."
  [text queries charts link-registry-atom]
  (str/replace text slack-link-pattern (partial resolve-slack-link queries charts link-registry-atom)))

(def ^:private slack-url-link-pattern
  "Regex matching a Slack-format link <url|text> with any HTTP(S) URL."
  #"<(https?://[^>|]+)(?:\|([^>]*))?>")

(defn invert-slack-links
  "Replace resolved absolute URLs with their original metabase:// URIs in Slack-format links.

  Only replaces URLs that appear inside `<url|text>` Slack link syntax.
  `registry-map` is a map of {resolved-absolute-url original-metabase-uri}.

  Returns `text` unchanged if `registry-map` is empty or nil."
  [text registry-map]
  (invert-matched-links text
                        slack-url-link-pattern
                        (fn [[_ url _]] url)
                        (fn [[_ _ link-text] original]
                          (if link-text
                            (str "<" original "|" link-text ">")
                            (str "<" original ">")))
                        registry-map))

(defn resolve-links-xf
  "Transducer that resolves metabase:// links in text parts.

  Takes queries-state and charts-state for link resolution.
  For :text parts, resolves metabase:// links to proper URLs.
  For other part types, passes through unchanged."
  [queries-state charts-state link-registry-atom]
  (map (fn [part]
         (if (and (= (:type part) :text) (:text part))
           (update part :text resolve-links queries-state charts-state link-registry-atom)
           part))))

;;; Part Processing (deprecated, use resolve-links-xf)

(defn process-part-links
  "Process metabase:// links in a part's text content.

  For :text parts, processes the text to resolve metabase:// links.
  For other part types, returns unchanged.

  Deprecated: Use resolve-links-xf transducer instead."
  [part queries-state charts-state link-registry-atom]
  (if (and (= (:type part) :text) (:text part))
    (update part :text resolve-links queries-state charts-state link-registry-atom)
    part))

(defn process-parts-links
  "Process metabase:// links in all parts.
  Returns parts with all text links resolved.

  Deprecated: Use resolve-links-xf transducer instead."
  [parts queries-state charts-state link-registry-atom]
  (into [] (resolve-links-xf queries-state charts-state link-registry-atom) parts))

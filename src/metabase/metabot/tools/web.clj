(ns metabase.metabot.tools.web
  "Metabot's tools for the public internet, in the two tiers LibreChat and Open WebUI converge on:
  `web_search` asks a search provider for `{title url snippet}` hits, and `read_web_page` fetches
  pages through the SSRF-hardened [[metabase.util.http/fetch-bytes]] and strips them to readable text."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.http :as u.http]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.io ByteArrayInputStream)
   (java.net URI)
   (org.jsoup Jsoup)
   (org.jsoup.nodes Document Element)))

(set! *warn-on-reflection* true)

(def ^:private serper-url "https://google.serper.dev/search")
(def ^:private search-timeout-ms 8000)
(def ^:private default-result-count 8)
(def ^:private max-result-count 10)

(def ^:private max-pages-per-call 3)
(def ^:private max-redirects 3)
(def ^:private page-fetch-timeout-ms 7500)
(def ^:private page-max-bytes (* 3 1024 1024))
(def ^:private max-page-chars 8000)
(def ^:private readable-content-types #{"text/html" "application/xhtml+xml" "text/plain"})

(defn- url->domain
  [url]
  (try
    (some-> (URI. ^String url) .getHost (str/replace #"^www\." "") not-empty)
    (catch Exception _ nil)))

;;; web_search

(defn- serper-search
  [{:keys [query date num]}]
  (let [resp (http/post serper-url
                        {:headers            {"X-API-KEY"    (metabot.settings/metabot-web-search-api-key)
                                              "Content-Type" "application/json"}
                         :body               (json/encode (cond-> {:q query :num num :gl "us" :hl "en"}
                                                            date (assoc :tbs (str "qdr:" date))))
                         :as                 :json
                         :socket-timeout     search-timeout-ms
                         :connection-timeout search-timeout-ms
                         :throw-exceptions   false})]
    (if (= 200 (:status resp))
      (:body resp)
      (throw (ex-info (str "the search provider returned HTTP " (:status resp))
                      {:status (:status resp)})))))

(defn- serper->results
  [body]
  (into []
        (comp (filter :link)
              (map (fn [{:keys [title link snippet date]}]
                     {:title   (or (not-empty title) link)
                      :url     link
                      :domain  (url->domain link)
                      :snippet snippet
                      :date    date})))
        (:organic body)))

(defn- xml-attr
  [k v]
  (when v
    (str " " k "=\"" (llm-shape/escape-xml v) "\"")))

(defn- result->xml
  [i {:keys [title url snippet date]}]
  (str "  <result" (xml-attr "index" (inc i)) (xml-attr "url" url) (xml-attr "date" date) ">\n"
       "    <title>" (llm-shape/escape-xml-content title) "</title>\n"
       (when snippet
         (str "    <snippet>" (llm-shape/escape-xml-content snippet) "</snippet>\n"))
       "  </result>\n"))

(defn- answer-box->xml
  [{:keys [title answer snippet]}]
  (when-let [text (or answer snippet)]
    (str "  <answer_box" (xml-attr "title" title) ">" (llm-shape/escape-xml-content text) "</answer_box>\n")))

(defn- knowledge-graph->xml
  [{:keys [title type description]}]
  (when description
    (str "  <knowledge_graph" (xml-attr "title" title) (xml-attr "type" type) ">"
         (llm-shape/escape-xml-content description) "</knowledge_graph>\n")))

(def ^:private search-instructions
  (str "<instructions>Snippets are short excerpts, not full pages. Do not describe these results to the user; "
       "call read_web_page now with the 1-3 most relevant URLs above (one call, several urls), then answer. "
       "Cite every fact you take from the web as a markdown link [title](url) using the exact URLs returned "
       "here.</instructions>"))

(defn- format-search-output
  [query body results]
  (str "<web_search_results" (xml-attr "query" query) (xml-attr "count" (count results)) ">\n"
       (answer-box->xml (:answerBox body))
       (knowledge-graph->xml (:knowledgeGraph body))
       (str/join (map-indexed result->xml results))
       "</web_search_results>\n"
       search-instructions))

(def ^:private web-search-schema
  [:map {:closed true}
   [:query [:string {:min 1 :description "The search query, phrased like a Google search."}]]
   [:date {:optional true}
    [:maybe [:enum {:description "Only return results from the past hour (h), day (d), week (w), month (m) or year (y). Use for anything recent or time-sensitive."}
             "h" "d" "w" "m" "y"]]]
   [:num {:optional true}
    [:maybe [:int {:min 1 :max max-result-count
                   :description (str "Number of results (default " default-result-count ", max " max-result-count ").")}]]]])

(defn- search-display
  [{:keys [query]}]
  ;; just the object (the query) — the client wraps it in the verb + tense
  ;; ("Searching the web for …" while active, "Searched the web for …" once finished)
  (when (string? query)
    (not-empty query)))

(mu/defn ^{:tool-name  "web_search"
           :scope      scope/agent-web-read
           :available? #'metabot.settings/metabot-web-search-enabled?
           :title-fn   search-display}
  web-search-tool
  "Search the public internet. Use it for anything that lives outside this Metabase instance: current events, third-party documentation, industry benchmarks, definitions, company or product facts. Returns titles, URLs and short snippets; call read_web_page on the most relevant 1-3 URLs when you need the actual page content. Never use it to find this instance's tables, questions or dashboards."
  [{:keys [query date num]} :- web-search-schema]
  (try
    (let [body    (serper-search {:query query :date date :num (or num default-result-count)})
          results (serper->results body)]
      {:output            (format-search-output query body results)
       :structured-output {:result-type :web_search
                           :total_count (count results)
                           :results     (mapv #(select-keys % [:title :url]) results)}
       :data-parts        [(streaming/web-results-part
                            {:total_count (count results)
                             :results     (mapv #(select-keys % [:title :url :domain :snippet]) results)})]})
    (catch Exception e
      (log/warn e "web_search failed")
      {:output (str "Web search failed: " (or (ex-message e) "unknown error"))})))

;;; read_web_page

(def ^:private boilerplate-selector
  "script, style, noscript, nav, header, footer, aside, form, iframe, svg, [role=navigation], [aria-hidden=true]")

(def ^:private content-root-selector "article, main, [role=main]")

(def ^:private text-block-selector "h1, h2, h3, h4, p, li, td, th, pre, blockquote")

(defn- clean-text
  [s]
  (-> s
      (str/replace #"[ \t\u00a0]+" " ")
      (str/replace #"\s*\n\s*" "\n")
      str/trim))

(defn- truncate-text
  [s]
  (if (> (count s) max-page-chars)
    (str (subs s 0 max-page-chars) "\n[truncated]")
    s))

(defn extract-page-text
  "Title and readable main text of a parsed HTML `doc`, with navigation and other boilerplate removed
  and the text capped at [[max-page-chars]]. Returns `{:title <string or nil> :content <string>}`."
  [^Document doc]
  (.remove (.select doc ^String boilerplate-selector))
  (let [^Element root (or (.first (.select doc ^String content-root-selector)) (.body doc))
        blocks        (.select root ^String text-block-selector)
        block-text    (str/join "\n" (map #(.text ^Element %) blocks))
        root-text     (.text root)
        ;; a page whose prose lives in bare divs leaves most of its text outside the block
        ;; walk; take the flat text then, otherwise keep the paragraph breaks
        text          (if (> (count root-text) (* 2 (count block-text))) root-text block-text)
        og-title      (some-> (.selectFirst doc "meta[property=og:title]") (.attr "content") not-empty)]
    {:title   (or (not-empty (.title doc)) og-title)
     :content (-> text clean-text truncate-text)}))

(def ^:private unfetchable-message
  "Could not fetch this page: it may be unreachable, not public HTML, too large, or it timed out.")

(defn- fetch-page
  [url]
  (let [page {:url url :domain (url->domain url)}]
    (if-let [{:keys [bytes]} (u.http/fetch-bytes url {:allowed-content-types readable-content-types
                                                      :max-bytes             page-max-bytes
                                                      :timeout-ms            page-fetch-timeout-ms
                                                      :max-redirects         max-redirects})]
      (merge page (extract-page-text (Jsoup/parse (ByteArrayInputStream. ^bytes bytes) nil ^String url)))
      (assoc page :error unfetchable-message))))

(defn- page->xml
  [{:keys [url title content error]}]
  (str "  <page" (xml-attr "url" url) (xml-attr "title" title) ">\n"
       (if error
         (str "    <error>" (llm-shape/escape-xml-content error) "</error>\n")
         (str (llm-shape/escape-xml-content content) "\n"))
       "  </page>\n"))

(def ^:private read-web-page-schema
  [:map {:closed true}
   [:urls [:sequential {:min 1 :max max-pages-per-call
                        :description (str "Absolute https URLs to read (max " max-pages-per-call "). Prefer URLs returned by web_search.")}
           :string]]])

(defn- read-display
  [{:keys [urls]}]
  (when (sequential? urls)
    ;; just the object (the sites) — the client wraps it in the verb + tense
    ;; ("Reading …" while active, "Read …" once finished)
    (not-empty (str/join ", " (distinct (keep #(when (string? %) (or (url->domain %) %)) urls))))))

(mu/defn ^{:tool-name  "read_web_page"
           :scope      scope/agent-web-read
           :available? #'metabot.settings/metabot-web-search-enabled?
           :title-fn   read-display}
  read-web-page-tool
  "Fetch up to 3 public web pages (https only) and return their main text with navigation and boilerplate stripped, capped at about 8,000 characters per page. Use it after web_search to read the sources that matter before answering, and cite them as markdown links [title](url)."
  [{:keys [urls]} :- read-web-page-schema]
  (let [pages    (mapv deref (mapv #(future (fetch-page %)) (distinct urls)))
        readable (remove :error pages)]
    (log/info "Read web pages" {:requested (count pages) :readable (count readable)})
    (cond-> {:output            (str "<web_pages>\n" (str/join (map page->xml pages)) "</web_pages>")
             :structured-output {:result-type :read_web_page
                                 :total_count (count readable)
                                 :results     (mapv #(select-keys % [:title :url]) readable)}}
      (seq readable)
      (assoc :data-parts [(streaming/web-results-part
                           {:total_count (count readable)
                            :results     (mapv #(select-keys % [:title :url :domain]) readable)})]))))

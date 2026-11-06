(ns metabase.metabot.tools.snippets
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.native-query-snippets.core :as snippets]))

(set! *warn-on-reflection* true)

(def ^:private page-size
  "How many snippets one page of `list_snippets` lists."
  50)

(tools/defrecoverable invalid-page!
  "A `page` past the last page of snippets."
  {:payload [:map {:closed true}
             [:page  :int]
             [:pages :int]]}
  [{:keys [page pages]}]
  {:message  (str "There is no page " page ". The snippet list has " pages (if (= 1 pages) " page." " pages."))
   :recovery []})

(defn- truncation-note
  "The note on page `page` of `pages`, which shows `shown` of `total` snippets, or nil on the last page."
  [shown total page pages]
  (when (< page pages)
    (let [left-out (- total shown)]
      (str "<truncation-note>Showing " shown " of " total " snippets (page " page " of " pages "); the other "
           left-out (if (= 1 left-out) " is" " are") " not listed. Call `list_snippets` with `page` " (inc page)
           " for the next page.</truncation-note>"))))

(defn- format-snippet-list-output
  [snippets total page pages]
  (if (seq snippets)
    (str "<snippets>\n"
         (str/join "\n" (map (fn [{:keys [id name description]}]
                               (str "<snippet id=\"" id "\" name=\"" (llm-shape/escape-xml name) "\">"
                                    (llm-shape/escape-xml-content description)
                                    "</snippet>"))
                             snippets))
         "\n"
         (some-> (truncation-note (count snippets) total page pages) (str "\n"))
         "</snippets>")
    "No snippets available."))

(defn- format-snippet-details-output
  [{:keys [id name description content]}]
  (str "<snippet id=\"" id "\" name=\"" (llm-shape/escape-xml name) "\">\n"
       (when description (str "<description>" (llm-shape/escape-xml-content description) "</description>\n"))
       (when content
         (str "<content><![CDATA[" (str/replace content "]]>" "]]]]><![CDATA[>") "]]></content>\n"))
       "</snippet>"))

(defrecord ListSnippetsTool []
  tools/Tool
  (declaration [_]
    {:name        "list_snippets"
     :description (str "List the SQL snippets the user can read. A snippet is a named piece of SQL, such as a "
                       "standard filter or a business definition, that queries reuse by name.\n\n"
                       "Call this tool before writing SQL for a request that relies on a business definition the "
                       "team may have saved, such as which customers count as active, and when the user mentions "
                       "a snippet. Also call it when the SQL in the editor references a snippet whose SQL you "
                       "need. Then call `get_snippet_details` to read the SQL of each snippet that may fit.")
     :scope       scope/agent-snippets-read
     :args        [:map {:closed true}
                   [:page {:optional true}
                    [:maybe [:int {:min         1
                                   :description (str "The page of snippets to list, from 1 (the default). A page "
                                                     "lists up to " page-size " snippets.")}]]]]})
  (handle [_ {:keys [page]} _ctx]
    (let [page         (or page 1)
          all-snippets (snippets/list-native-query-snippets)
          total        (count all-snippets)
          pages        (max 1 (quot (+ total page-size -1) page-size))]
      (when (> page pages)
        (invalid-page! {:page page :pages pages}))
      {:output (format-snippet-list-output (->> all-snippets (drop (* (dec page) page-size)) (take page-size))
                                           total page pages)})))

(def list-snippets-tool
  "The `list_snippets` tool."
  (->ListSnippetsTool))

(defrecord GetSnippetDetailsTool []
  tools/Tool
  (declaration [_]
    {:name        "get_snippet_details"
     :description (str "Get a SQL snippet's name, description and SQL, by an ID from `list_snippets`.\n\n"
                       "To use the snippet in a query, write `{{snippet: <name>}}` with its exact name where its "
                       "SQL belongs. Metabase puts the snippet's SQL in place of the reference when the query "
                       "runs, so the query follows later changes to the snippet. Reference the snippet instead of "
                       "copying its SQL. A snippet is not tied to a database: use it only if its SQL works with "
                       "the database you are querying.")
     :scope       scope/agent-snippets-read
     :args        [:map {:closed true} [:snippet_id :int]]})
  (handle [_ {snippet-id :snippet_id} _ctx]
    (let [snippet (tools/with-entity {:kind :snippet :id snippet-id}
                    (or (when (pos-int? snippet-id)
                          (snippets/get-native-query-snippet snippet-id))
                        (recoverable.common/not-found! {:kind :snippet :id snippet-id})))]
      {:output (format-snippet-details-output snippet)})))

(def get-snippet-details-tool
  "The `get_snippet_details` tool."
  (->GetSnippetDetailsTool))

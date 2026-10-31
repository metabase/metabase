(ns metabase.metabot.tools.snippets
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.native-query-snippets.core :as snippets]))

(set! *warn-on-reflection* true)

(defn- format-snippet-list-output
  [snippets]
  (if (seq snippets)
    (str "<snippets>\n"
         (str/join "\n" (map (fn [{:keys [id name description]}]
                               (str "<snippet id=\"" id "\" name=\"" (llm-shape/escape-xml name) "\">"
                                    (llm-shape/escape-xml-content description)
                                    "</snippet>"))
                             snippets))
         "\n</snippets>")
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
     :args        [:map {:closed true}]})
  (handle [_ _args _ctx]
    {:output (format-snippet-list-output (snippets/list-native-query-snippets))}))

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

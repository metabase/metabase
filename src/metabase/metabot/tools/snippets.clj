(ns metabase.metabot.tools.snippets
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.native-query-snippets.core :as snippets]))

(set! *warn-on-reflection* true)

(defn- format-snippet-list-output
  [snippets]
  (if (seq snippets)
    (str "<snippets>\n"
         (str/join "\n" (map (fn [{:keys [id name description]}]
                               (str "<snippet id=\"" id "\" name=\"" name "\">"
                                    (when description description)
                                    "</snippet>"))
                             snippets))
         "\n</snippets>")
    "No snippets available."))

(defn- format-snippet-details-output
  [{:keys [id name description content]}]
  (str "<snippet id=\"" id "\" name=\"" name "\">\n"
       (when description (str "<description>" description "</description>\n"))
       (when content (str "<content>\n" content "\n</content>\n"))
       "</snippet>"))

(defrecord ListSnippetsTool []
  tools/Tool
  (declaration [_]
    {:name        "list_snippets"
     :description "List all SQL snippets available in the Metabase instance.

  Use this tool before editing or creating SQL transforms to understand what
  snippets are available. If any snippets may be relevant to the user's request,
  fetch their content using the get_snippet_details tool."
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
     :description "Get the full details of a SQL snippet including its content.

  Use this tool to retrieve the actual SQL content of a snippet after identifying
  it with list_snippets."
     :scope       scope/agent-snippets-read
     :args        [:map {:closed true} [:snippet_id :int]]})
  (handle [_ {snippet-id :snippet_id} _ctx]
    (let [snippet (tools/with-entity {:kind :snippet :id snippet-id}
                    (or (snippets/get-native-query-snippet snippet-id)
                        (recoverable.common/not-found! {:kind :snippet :id snippet-id})))]
      {:output (format-snippet-details-output snippet)})))

(def get-snippet-details-tool
  "The `get_snippet_details` tool."
  (->GetSnippetDetailsTool))

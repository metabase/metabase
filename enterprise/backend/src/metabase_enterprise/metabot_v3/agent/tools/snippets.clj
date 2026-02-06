(ns metabase-enterprise.metabot-v3.agent.tools.snippets
  "Snippet tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.tools.snippets :as snippet-tools]
   [metabase.util.malli :as mu]))

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

(defn- add-output
  "Add :output to a tool result. Handles both :structured_output and :structured-output."
  [result format-fn]
  (if-let [structured (or (:structured_output result) (:structured-output result))]
    (assoc result :output (format-fn structured))
    result))

(mu/defn ^{:tool-name "list_snippets"
           :capabilities #{:feature-snippets}} list-snippets-tool
  "List all SQL snippets available in the Metabase instance.

  Use this tool before editing or creating SQL transforms to understand what
  snippets are available. If any snippets may be relevant to the user's request,
  fetch their content using the get_snippet_details tool."
  [_args :- [:map {:closed true}]]
  (add-output (snippet-tools/get-snippets {}) format-snippet-list-output))

(mu/defn ^{:tool-name "get_snippet_details"
           :capabilities #{:feature-snippets}} get-snippet-details-tool
  "Get the full details of a SQL snippet including its content.

  Use this tool to retrieve the actual SQL content of a snippet after identifying
  it with list_snippets."
  [{:keys [snippet_id]}
   :- [:map {:closed true}
       [:snippet_id :int]]]
  (add-output (snippet-tools/get-snippet-details {:snippet-id snippet_id}) format-snippet-details-output))

(ns metabase.metabot.agent.tools.snippets
  "Snippet tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.snippets :as snippet-tools]))

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

(defn list-snippets-tool "list-snippets-tool" []
  {:tool-name    "list_snippets"
   :capabilities #{:feature-snippets}
   :doc          "List all SQL snippets available in the Metabase instance.

  Use this tool before editing or creating SQL transforms to understand what
  snippets are available. If any snippets may be relevant to the user's request,
  fetch their content using the get_snippet_details tool."
   :schema       [:=> [:cat [:maybe [:map {:closed true}]]] :any]
   :fn           (fn [_args]
                   (add-output (snippet-tools/get-snippets {}) format-snippet-list-output))})

(defn get-snippet-details-tool "get-snippet-details-tool" []
  {:tool-name    "get_snippet_details"
   :capabilities #{:feature-snippets}
   :doc          "Get the full details of a SQL snippet including its content.

  Use this tool to retrieve the actual SQL content of a snippet after identifying
  it with list_snippets."
   :schema       [:=> [:cat [:map {:closed true} [:snippet_id :int]]] :any]
   :fn           (fn [{:keys [snippet_id]}]
                   (add-output (snippet-tools/get-snippet-details {:snippet-id snippet_id}) format-snippet-details-output))})

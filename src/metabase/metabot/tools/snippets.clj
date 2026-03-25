(ns metabase.metabot.tools.snippets
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn get-snippets
  "Lists SQL snippets available to the current user."
  [_args]
  (try
    {:structured_output
     (->> (snippets/list-native-query-snippets)
          (map #(select-keys % [:id :name :description])))}
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))

(defn get-snippet-details
  "Retrieve a specific SQL snippet by ID, including its content."
  [{:keys [snippet-id]}]
  (try
    {:structured_output
     (when snippet-id
       (when-let [snippet (snippets/get-native-query-snippet snippet-id)]
         (select-keys snippet [:id :name :description :content])))}
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))

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

(mu/defn ^{:tool-name    "list_snippets"
           :capabilities #{:feature-snippets}}
  list-snippets-tool
  "List all SQL snippets available in the Metabase instance.

  Use this tool before editing or creating SQL transforms to understand what
  snippets are available. If any snippets may be relevant to the user's request,
  fetch their content using the get_snippet_details tool."
  [_args :- [:maybe [:map {:closed true}]]]
  (add-output (get-snippets {}) format-snippet-list-output))

(mu/defn ^{:tool-name    "get_snippet_details"
           :capabilities #{:feature-snippets}}
  get-snippet-details-tool
  "Get the full details of a SQL snippet including its content.

  Use this tool to retrieve the actual SQL content of a snippet after identifying
  it with list_snippets."
  [{:keys [snippet_id]} :- [:map {:closed true} [:snippet_id :int]]]
  (add-output (get-snippet-details {:snippet-id snippet_id}) format-snippet-details-output))

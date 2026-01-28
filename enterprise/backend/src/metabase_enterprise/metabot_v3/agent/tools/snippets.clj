(ns metabase-enterprise.metabot-v3.agent.tools.snippets
  "Snippet tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.tools.snippets :as snippet-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "list_snippets"
           :capabilities #{:feature-snippets}} list-snippets-tool
  "List all SQL snippets available in the Metabase instance.

  Use this tool before editing or creating SQL transforms to understand what
  snippets are available. If any snippets may be relevant to the user's request,
  fetch their content using the get_snippet_details tool."
  [_args :- [:map {:closed true}]]
  (snippet-tools/get-snippets {}))

(mu/defn ^{:tool-name "get_snippet_details"
           :capabilities #{:feature-snippets}} get-snippet-details-tool
  "Get the full details of a SQL snippet including its content.

  Use this tool to retrieve the actual SQL content of a snippet after identifying
  it with list_snippets."
  [{:keys [snippet_id]}
   :- [:map {:closed true}
       [:snippet_id :int]]]
  (snippet-tools/get-snippet-details {:snippet-id snippet_id}))

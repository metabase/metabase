(ns metabase-enterprise.metabot-v3.tools.show-results-to-user
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.metabot-v3.envelope :as env]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.public-settings :as public-settings]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/show-results-to-user
  [_tool-name {:keys [query-id] :as _arguments} env]
  (if-let [query (env/find-query env query-id)]
    (let [query-hash (-> {:dataset_query query}
                         json/encode
                         (.getBytes "UTF-8")
                         codecs/bytes->b64-str)]
      {:output (str "Results can be seen at: " (public-settings/site-url) "/question#" query-hash)
       :reactions [{:type :metabot.reaction/redirect :url (str "/question#" query-hash)}]})
    {:output (str "No query found with query_id " query-id)}))

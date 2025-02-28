(ns metabase-enterprise.metabot-v3.tools.show-results-to-user
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.public-settings :as public-settings]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn show-results-to-user
  "Generate link where the query can be seen."
  [{:keys [query] :as _arguments}]
  (let [query-hash (-> {:dataset_query query}
                       json/encode
                       (.getBytes "UTF-8")
                       codecs/bytes->b64-str)
        results-url (str "/question#" query-hash)]
    {:output (str "Results can be seen at: " (public-settings/site-url) results-url)
     :reactions [{:type :metabot.reaction/redirect, :url results-url}]}))

(ns metabase-enterprise.metabot-v3.tools.show-results-to-user-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.show-results-to-user :as metabot-v3.tools.show-results-to-user]
   [metabase.public-settings :as public-settings]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest it-generates-a-reaction
  (let [query {:database 1
               :type :query
               :query {:source-table 3
                       :breakout [[:field 13 {:base-type :type/DateTime, :temporal-unit :month}]]
                       :aggregation [[:metric 123]]
                       :filter [:=
                                [:get-year [:field 13 {:base-type :type/DateTime, :temporal-unit :month}]]
                                2024]}}
        query-hash (-> {:dataset_query query} json/encode .getBytes codecs/bytes->b64-str)
        results-url (str "/question#" query-hash)]
    (is (= {:output (str "Results can be seen at: " (public-settings/site-url) results-url)
            :reactions [{:type :metabot.reaction/redirect, :url results-url}]}
           (metabot-v3.tools.show-results-to-user/show-results-to-user {:query query})))))

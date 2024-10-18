(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api :as metabot-v3.api]))

(deftest ^:parallel encode-reactions-test
  (testing "FE should see snake_case keys in reactions"
    (is (= [{:type          :metabot.reaction/collection-updated
             :collection_id 1}]
           (#'metabot-v3.api/encode-reactions
            [{:type          :metabot.reaction/collection-updated
              :collection-id 1}])))))

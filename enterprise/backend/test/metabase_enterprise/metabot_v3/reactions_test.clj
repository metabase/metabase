(ns metabase-enterprise.metabot-v3.reactions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel reaction-schema-test
  (testing "Known/registered reactions"
    (is (mr/validate
         ::metabot-v3.reactions/reaction
         {:type :metabot.reaction/message, :message "Hello"}))
    (is (not (mr/validate
              ::metabot-v3.reactions/reaction
              {:type :metabot.reaction/message}))))
  (testing "Should allow unregistered reactions"
    (mr/validate
     ::metabot-v3.reactions/reaction
     {:type :metabot.reaction/unknown-does-not-exist})))

(ns metabase.metabot.reactions-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.reactions :as metabot.reactions]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel reaction-schema-test
  (testing "Known/registered reactions"
    (is (mr/validate
         ::metabot.reactions/reaction
         {:type :metabot.reaction/message, :message "Hello"}))
    (is (not (mr/validate
              ::metabot.reactions/reaction
              {:type :metabot.reaction/message}))))
  (testing "Should allow unregistered reactions"
    (mr/validate
     ::metabot.reactions/reaction
     {:type :metabot.reaction/unknown-does-not-exist})))

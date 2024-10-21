(ns metabase-enterprise.metabot-v3.reactions-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]))

(deftest ^:parallel reaction-schema-test
  (testing "Known/registered reactions"
    (is (mc/validate
         ::metabot-v3.reactions/reaction
         {:type :metabot.reaction/message, :message "Hello"}))
    (is (not (mc/validate
              ::metabot-v3.reactions/reaction
              {:type :metabot.reaction/message}))))
  (testing "Should allow unregistered reactions"
    (mc/validate
     ::metabot-v3.reactions/reaction
     {:type :metabot.reaction/unknown-does-not-exist})))

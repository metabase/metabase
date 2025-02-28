(ns metabase-enterprise.metabot-v3.client-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]))

(deftest ^:parallel decode-response-body-test
  (is (= {:message {:content    nil
                    :role       :assistant
                    :tool-calls [{:id        "call_1drvrXfHb6q9Doxh8leujqKB"
                                  :name      :metabot.tool/say-hello
                                  :arguments {:name "User"
                                              :greeting "Hello!"}}]}}
         (#'metabot-v3.client/decode-response-body
          {:message {:content nil
                     :role "assistant"
                     :tool_calls [{:id "call_1drvrXfHb6q9Doxh8leujqKB"
                                   :name "say-hello"
                                   :arguments "{\"name\":\"User\",\"greeting\":\"Hello!\"}"}]}}))))

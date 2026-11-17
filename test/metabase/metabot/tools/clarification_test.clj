(ns metabase.metabot.tools.clarification-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.clarification :as clarification]
   [metabase.metabot.tools.core :as tools]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel clarification-output-test
  (doseq [[options expected] [[nil "Which table?"]
                              [[] "Which table?"]
                              [["birds" "sightings"] "Which table?\n\nOptions:\n- birds\n- sightings"]]]
    (let [result (tools/call clarification/ask-for-sql-clarification-tool
                             {:question "Which table?" :options options} {})]
      (is (mr/validate ::tools/result result))
      (is (= {:output expected} result)))))

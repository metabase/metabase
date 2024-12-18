(ns metabase-enterprise.metabot-v3.tools.who-is-your-favorite-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]))

(deftest it-generates-a-reaction
  (is (= {:output "You are... but don't tell anyone!"}
         (tools.interface/*invoke-tool* :metabot.tool/who-is-your-favorite {} {}))))

(ns metabase-enterprise.metabot-v3.tools.change-display-type-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]))

(deftest it-generates-a-reaction
  (is (= {:output "success",
          :reactions [{:display-type "foo"
                       :type :metabot.reaction/change-display-type}]}
         (tools.interface/*invoke-tool* :metabot.tool/change-display-type {:type "foo"}))))

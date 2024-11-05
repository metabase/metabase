(ns metabase-enterprise.metabot-v3.tools.who-is-your-favorite-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]))

(deftest it-generates-a-reaction
  (is (= {:reactions
          [{:type :metabot.reaction/message
            :message "You are... but don't tell anyone!"}],
          :output "This current user is my favorite."}
         (tools.interface/*invoke-tool* :metabot.tool/who-is-your-favorite {}))))

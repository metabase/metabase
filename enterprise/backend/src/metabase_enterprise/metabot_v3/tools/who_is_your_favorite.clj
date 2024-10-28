(ns metabase-enterprise.metabot-v3.tools.who-is-your-favorite
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/who-is-your-favorite
  [_tool-name _arg-map]
  {:reactions [{:type :metabot.reaction/message
                :message "You are... but don't tell anyone!"}]
   :output "This current user is my favorite."})

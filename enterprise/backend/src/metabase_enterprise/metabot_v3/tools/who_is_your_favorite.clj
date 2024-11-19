(ns metabase-enterprise.metabot-v3.tools.who-is-your-favorite
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/who-is-your-favorite
  [_tool-name _arg-map context]
  {:output  "You are... but don't tell anyone!"
   :context context})

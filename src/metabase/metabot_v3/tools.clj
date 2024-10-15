(ns metabase.metabot-v3.tools
  (:require
   [metabase.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.metabot-v3.tools.invite-user]
   [metabase.metabot-v3.tools.say-hello]
   [metabase.metabot-v3.tools.who-is-your-favorite]
   [metabase.util.malli :as mu]))

(comment
  metabase.metabot-v3.tools.who-is-your-favorite/keep-me
  metabase.metabot-v3.tools.say-hello/keep-me
  metabase.metabot-v3.tools.invite-user/keep-me)

(mu/defn tool-names :- [:sequential :keyword]
  "Get a list of keyword names of all known tools."
  []
  (sort (keys (methods metabot-v3.tools.interface/tool-definition))))

(mu/defn tool-definitions :- [:sequential ::metabot-v3.tools.interface/tool]
  "Get a list of tool definitions for all known tools."
  []
  (for [tool-name (tool-names)]
    (metabot-v3.tools.interface/tool-definition tool-name)))

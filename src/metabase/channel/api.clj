(ns metabase.channel.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.channel.api.channel]
   [metabase.channel.api.email]
   [metabase.channel.api.slack]))

(comment metabase.channel.api.channel/keep-me
         metabase.channel.api.email/keep-me
         metabase.channel.api.slack/keep-me)

(def ^{:arglists '([request respond raise])} channel-routes
  "/api/channel routes"
  (api.macros/ns-handler 'metabase.channel.api.channel))

(def ^{:arglists '([request respond raise])} email-routes
  "/api/email routes"
  (api.macros/ns-handler 'metabase.channel.api.email))

(def ^{:arglists '([request respond raise])} slack-routes
  "/api/slack routes"
  (api.macros/ns-handler 'metabase.channel.api.slack))

(ns metabase-enterprise.monitor-relay.api
  "`/api/ee/monitor-relay` routes."
  (:require
   [metabase-enterprise.monitor-relay.config :as relay.config]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private Status
  [:map {:closed true}
   [:url  [:map {:closed true}
           [:status [:enum "ok" "unset" "malformed"]]
           [:base   [:maybe :string]]]]
   [:node [:map {:closed true}
           [:node_id      :string]
           [:ran_here     :boolean]
           [:last_run_at  [:maybe ms/TemporalInstant]]
           [:last_result  [:maybe [:map {:closed true}
                                   [:outcome [:enum "ok" "stale" "refused" "busy" "failed"]]
                                   [:message :string]]]]
           [:failures     :int]
           [:paused_until [:maybe ms/TemporalInstant]]]]
   [:feed [:map {:closed true}
           [:at     [:maybe ms/TemporalInstant]]
           [:error  [:maybe :string]]
           [:status [:maybe relay.cycle/ReceiverStatus]]]]])

(api.macros/defendpoint :get "/status" :- Status
  "The Metabase Monitor relay on the node that answers: its URL without the token, whether the URL is well formed, its
  last result, and the status that Metabase Monitor answers now, which it asks for at each request. Superuser only."
  []
  (api/check-superuser)
  (let [target (relay.config/target)]
    {:url  {:status (name (:status target)), :base (:base target)}
     :node (relay.cycle/node-status)
     :feed (relay.cycle/feed target)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/monitor-relay` routes."
  (api.macros/ns-handler *ns* +auth))

(ns metabase.metabot.api.digest
  "`/api/metabot/digest` routes.

  The digest is a page, not a conversation: one request runs the `:digest` profile to completion and returns the
  structured result. Nothing streams, so the client is a single fetch and a render rather than a stream consumer."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.metabot.agent.core :as metabot.agent]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private digest-item-schema
  [:map
   [:model :string]
   [:id ms/PositiveInt]
   [:name [:maybe :string]]
   [:description [:maybe :string]]
   [:card_type [:maybe :string]]
   ;; nil when the model left this item out of its `render_digest` call: the item still renders
   [:reason [:maybe :string]]
   [:signals [:sequential :string]]
   ;; present only when the entity's own page would not show the movement — the client opens it ad hoc
   [:anomaly_query {:optional true} ::lib-be.schema/maybe-legacy-query]
   [:anomaly_display {:optional true} [:maybe :string]]])

(def ^:private digest-response-schema
  [:map
   [:summary [:maybe :string]]
   [:items [:sequential digest-item-schema]]
   [:error [:maybe :string]]])

(defn- part->structured-output
  [part]
  (or (get-in part [:result :structured-output])
      (get-in part [:result :structured_output])))

(defn- digest-structured-output
  "The `render_digest` payload among the agent's parts. Matched on the presence of `:items` rather than on
  `:result-type`, whose keyword survives the response transformer in more than one spelling."
  [parts]
  (->> parts
       (filter #(= :tool-output (:type %)))
       (keep part->structured-output)
       (filter map?)
       (filter #(contains? % :items))
       last))

(api.macros/defendpoint :post "/" :- digest-response-schema
  "Build the current user's digest: run the `:digest` Metabot profile once and return what it chose to surface."
  [_route-params _query-params _body]
  (let [metabot-id (metabot.config/resolve-dynamic-metabot-id nil)]
    (metabot.config/check-metabot-enabled! metabot-id)
    (metabot.usage/check-metabase-managed-free-limit!)
    (let [context (metabot.context/create-context {} {:metabot-id metabot-id
                                                      :profile-id :digest})
          parts   (into [] (metabot.agent/run-agent-loop
                            {:messages      [{:role    :user
                                              :content "Build my digest."}]
                             :metabot-id    metabot-id
                             :profile-id    :digest
                             :state         {}
                             :context       context
                             :tracking-opts {:source "metabot_agent"}}))]
      (if-let [{:keys [summary items]} (digest-structured-output parts)]
        {:summary summary
         :items   (vec items)
         :error   nil}
        {:summary nil
         :items   []
         :error   "Unable to build a digest."}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/digest` routes."
  (api.macros/ns-handler *ns* +auth))

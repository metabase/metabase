(ns metabase.analytics.llm-token-usage
  "LLM token usage tracking for Snowplow and Prometheus."
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.analytics.util :as analytics.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private SnowplowArgs
  [:map
   [:request-id                                     :string]
   [:model-id                                       :string]
   [:total-tokens                                   ms/IntGreaterThanOrEqualToZero]
   [:prompt-tokens                                  ms/IntGreaterThanOrEqualToZero]
   [:completion-tokens                              ms/IntGreaterThanOrEqualToZero]
   [:estimated-costs-usd                            number?]
   [:cache-creation-tokens         {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:cache-read-tokens             {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:user-id                       {:optional true} [:maybe :int]]
   [:duration-ms                   {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:source                        {:optional true} [:maybe :string]]
   [:tag                           {:optional true} [:maybe :string]]
   [:session-id                    {:optional true} [:maybe :string]]
   [:profile                       {:optional true} [:maybe :string]]
   [:hashed-metabase-license-token {:optional true} [:maybe :string]]])

(mu/defn track-snowplow!
  "Track snowplow token_usage event."
  [{:keys [request-id model-id total-tokens prompt-tokens completion-tokens
           cache-creation-tokens cache-read-tokens
           estimated-costs-usd user-id duration-ms source tag session-id profile
           hashed-metabase-license-token]}
   :- SnowplowArgs]
  (snowplow/track-event! :snowplow/token_usage
                         {:hashed-metabase-license-token (or hashed-metabase-license-token
                                                             (analytics.util/hashed-metabase-token-or-uuid))
                          :request-id                    request-id
                          :model-id                      model-id
                          :total-tokens                  total-tokens
                          :prompt-tokens                 prompt-tokens
                          :completion-tokens             completion-tokens
                          :cache-creation-tokens         cache-creation-tokens
                          :cache-read-tokens             cache-read-tokens
                          :estimated-costs-usd           estimated-costs-usd
                          :user-id                       user-id
                          :duration-ms                   (some-> duration-ms long)
                          :source                        source
                          :tag                           tag
                          :session-id                    session-id
                          :profile                       profile}
                         user-id))

(def ^:private PrometheusArgs
  [:map
   [:model-id                              :string]
   [:tag                                   :string]
   [:prompt-tokens                         ms/IntGreaterThanOrEqualToZero]
   [:completion-tokens                     ms/IntGreaterThanOrEqualToZero]
   [:cache-creation-tokens {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:cache-read-tokens     {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mu/defn track-prometheus!
  "Track Prometheus LLM token usage metrics."
  [{:keys [model-id tag prompt-tokens completion-tokens
           cache-creation-tokens cache-read-tokens]}
   :- PrometheusArgs]
  (let [labels {:model model-id :source tag}]
    (prometheus/inc! :metabase-metabot/llm-input-tokens labels prompt-tokens)
    (prometheus/inc! :metabase-metabot/llm-output-tokens labels completion-tokens)
    (when (and cache-creation-tokens (pos? cache-creation-tokens))
      (prometheus/inc! :metabase-metabot/llm-cache-creation-tokens labels cache-creation-tokens))
    (when (and cache-read-tokens (pos? cache-read-tokens))
      (prometheus/inc! :metabase-metabot/llm-cache-read-tokens labels cache-read-tokens))
    (prometheus/observe! :metabase-metabot/llm-tokens-per-call labels (+ prompt-tokens completion-tokens))))

(mu/defn track-token-usage!
  "Convenience wrapper that fires Snowplow and/or Prometheus token tracking.

  Accepts all keys for [[track-snowplow!]] and [[track-prometheus!]], plus:
    - `:snowplow`   (required boolean) — pass `false` to suppress Snowplow
    - `:prometheus` (required boolean) — pass `false` to suppress Prometheus"
  [{:keys [snowplow prometheus] :as opts}
   :- [:merge
       [:map
        [:snowplow    [:boolean {:default true}]]
        [:prometheus  [:boolean {:default true}]]]
       [:multi {:dispatch (juxt :snowplow :prometheus)}
        [[true  false] SnowplowArgs]
        [[false true]  PrometheusArgs]
        [[true  true]  [:merge SnowplowArgs PrometheusArgs]]
        [[false false] [:fn {:error/message "at least one of :snowplow or :prometheus must be true"}
                        (constantly false)]]]]]
  (when snowplow
    (track-snowplow! opts))
  (when prometheus
    (track-prometheus! opts)))

(ns metabase.analytics.llm-token-usage
  "LLM token usage tracking for Snowplow and Prometheus."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^{:arglists '([token])
       :private  true}
  memoized-sha256-hex
  "Memoized SHA-256 hex hash."
  (memoize (fn [token] (some-> token buddy-hash/sha256 codecs/bytes->hex))))

(defn- hashed-metabase-token-or-uuid
  "Returns a value suitable for use as the :hashed-metabase-license-token for snowplow token_usage events."
  []
  ;; The analytics-uuid is a fallback for LLM features like sql generation in OSS builds that don't have a
  ;; premium-embedding-token.
  ;; https://metaboat.slack.com/archives/C07SJT1P0ET/p1769582038106939?thread_ts=1769493176.349639&cid=C07SJT1P0ET
  (or (some-> (not-empty (premium-features/premium-embedding-token))
              memoized-sha256-hex)
      (str "oss__" (analytics.settings/analytics-uuid))))

(mu/defn uuid->token-usage-request-id :- :string
  "Convert a UUID (string or object) to a snowplow token_usage request-id by stripping dashes.

  Not strictly required, but matches the old ai-service uuid.hex formatting for consistency."
  [uuid :- [:or ms/UUIDString :uuid]]
  (-> uuid str (str/replace "-" "")))

(def ^:private SnowplowArgs
  [:map
   [:request-id                                     :string]
   [:model-id                                       :string]
   [:total-tokens                                   ms/IntGreaterThanOrEqualToZero]
   [:prompt-tokens                                  ms/IntGreaterThanOrEqualToZero]
   [:completion-tokens                              ms/IntGreaterThanOrEqualToZero]
   [:estimated-costs-usd                            number?]
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
           estimated-costs-usd user-id duration-ms source tag session-id profile
           hashed-metabase-license-token]}
   :- SnowplowArgs]
  (snowplow/track-event! :snowplow/token_usage
                         {:hashed-metabase-license-token (or hashed-metabase-license-token
                                                             (hashed-metabase-token-or-uuid))
                          :request-id                    request-id
                          :model-id                      model-id
                          :total-tokens                  total-tokens
                          :prompt-tokens                 prompt-tokens
                          :completion-tokens             completion-tokens
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
   [:model-id          :string]
   [:tag               :string]
   [:prompt-tokens     ms/IntGreaterThanOrEqualToZero]
   [:completion-tokens ms/IntGreaterThanOrEqualToZero]])

(mu/defn track-prometheus!
  "Track Prometheus LLM token usage metrics."
  [{:keys [model-id tag prompt-tokens completion-tokens]}
   :- PrometheusArgs]
  (let [labels {:model model-id :source tag}]
    (prometheus/inc! :metabase-metabot/llm-input-tokens labels prompt-tokens)
    (prometheus/inc! :metabase-metabot/llm-output-tokens labels completion-tokens)
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

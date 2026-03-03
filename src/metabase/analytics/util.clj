(ns metabase.analytics.util
  "Shared analytics utilities."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^{:arglists '([token])
       :private  true}
  memoized-sha256-hex
  "Memoized SHA-256 hex hash."
  (memoize (fn [token] (some-> token buddy-hash/sha256 codecs/bytes->hex))))

(mu/defn hashed-metabase-token-or-uuid :- :string
  "Returns a value suitable for use as :hashed-metabase-license-token in snowplow events."
  []
  ;; The analytics-uuid is a fallback for LLM features like sql generation in OSS builds that don't have a
  ;; premium-embedding-token.
  ;; https://metaboat.slack.com/archives/C07SJT1P0ET/p1769582038106939?thread_ts=1769493176.349639&cid=C07SJT1P0ET
  (or (some-> (not-empty (premium-features/premium-embedding-token))
              memoized-sha256-hex)
      (str "oss__" (analytics.settings/analytics-uuid))))

(mu/defn uuid->ai-service-hex-uuid :- :string
  "Convert a UUID (string or object) to a hex uuid by stripping dashes.

  Matches the old uuid.hex formatting for analytics ported from ai-service."
  [uuid :- [:or ms/UUIDString :uuid]]
  (-> uuid str (str/replace "-" "")))

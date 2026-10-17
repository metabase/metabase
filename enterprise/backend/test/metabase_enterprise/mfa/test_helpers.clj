(ns metabase-enterprise.mfa.test-helpers
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]))

(defn mfa-events!
  "The MFA events in the fake Snowplow collector as [event event_detail triggered_from] tuples, draining it.
  Filtered to the `mfa_` prefix because the login steps these flows go through emit events of their own."
  []
  (into [] (keep (fn [{{:strs [event event_detail triggered_from]} :data
                       :keys [user-id]}]
                   (when (str/starts-with? (str event) "mfa_")
                     {:event          event
                      :event_detail   event_detail
                      :triggered_from triggered_from
                      :user-id        (some-> user-id str)})))
        (snowplow-test/pop-event-data-and-user-id!)))

(ns metabase.util.tracking
  (:require [metabase.models.setting :as setting]
            [clj-http.client :as client]))

(def ^:private ^:const ^String google-analytics-collect-url "http://www.google-analytics.com/collect")
;; This is also in public_settings.clj. Should I access it from there?
(def ^:private ^:const ^String metabase-google-analytics-id "UA-60817802-1")

(def ^:private ^Integer anonymous-id
  "Generate an anonymous id. Don't worry too much about hash collisions or localhost cases, etc.
   The goal is to be able to get a rough sense for how many different hosts are throwing a specific error/event." 
  (hash (str (java.net.InetAddress/getLocalHost)))
  )

(defn track-event!
  "Send anonymous usage information via Google Analytics
   For server errors, the use event-category `server-error`
   For others use `server-event`"
  ([event-category event-action]
   (track-event! event-category event-action "" ""))
  ([event-category event-action event-label]
   (track-event! event-category event-action event-label ""))
  ([event-category event-action event-label event-value]
    (when (setting/get :anon-tracking-enabled)
      (let [form-params {:v 1
                         :tid metabase-google-analytics-id 
                         :cid anonymous-id
                         :t "event"
                         :ec event-category
                         :ea event-action
                         :el event-label
                         :ev event-value } ]
        (client/post google-analytics-collect-url {:form-params form-params})))))
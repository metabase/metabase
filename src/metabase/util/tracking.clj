(ns metabase.util.tracking
  (:require [clj-http.client :as client]))

(def ^:private ^:const ^String google-analytics-collect-url "http://www.google-analytics.com/collect")

(def ^:private ^Integer anonymous-id
  "Generate an anonymous id. Don't worry too much about hash collisions or localhost cases, etc.
   The goal is to be able to get a rough sense for how many different hosts are throwing a specific error/event." 
  (hash (str (java.net.InetAddress/getLocalHost))))

(defn- google-analytics-tracking-code
  "Get the GA id for the main metabase application"
  []
  (require 'metabase.public-settings)
  ((resolve 'metabase.public-settings/ga_code)))

(defn- anon-tracking-enabled? 
  "To avoid a circular reference"
  []
  (require 'metabase.public-settings)
  ((resolve 'metabase.public-settings/anon-tracking-enabled)))

(defn track-event!
  "Send anonymous usage information via Google Analytics
   For server errors, the use event-category `server-error`
   For others use `server-event`"
  [& {:keys [category action label value]
      :or {label "" 
           value ""}}]
  {:pre [(string? category) (string? action)]}
  (when (anon-tracking-enabled?)
    (let [form-params {:v 1
                      :tid (google-analytics-tracking-code)
                      :cid anonymous-id
                      :t "event"
                      :ec category
                      :ea action
                      :el label
                      :ev value } ]
        (future (client/post google-analytics-collect-url {:form-params form-params})))))
  


(defn track-error! 
  "Simpler way to track errors that keeps our event labels tidy"
  [& {:keys [action label value]
      :or {label "" 
           value ""}}]
  (track-event! :category "server-error" :action action :label label :value value)
  )

((defn track-info! 
  "Simpler way to track server events that keeps our event labels tidy"
  [& {:keys [action label value]
      :or {label "" 
           value ""}}]
  (track-event! :category "server-info" :action action :label label :value value)
  ))
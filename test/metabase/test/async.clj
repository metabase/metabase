(ns metabase.test.async
  "Utilities for testing async API endpoints."
  (:require [clojure.tools.logging :as log]
            [metabase.test.data.users :refer :all]))

(def ^:private ^:const max-retries 20)

(defn call-with-retries
  "Retries fetching job results until `max-retries` times."
  [user job-id]
  (loop [tries 1]
    (let [{:keys [status result] :as response}
          ((user->client user) :get 200 (str "async/" job-id))]
      (cond
        (= "done" status)     result
        (> tries max-retries) (throw (ex-info "Timeout. Max retries exceeded."
                                       response))
        :else                 (do
                                (log/info (format "Waiting for computation to finish. Retry: %" tries))
                                (Thread/sleep (* 100 tries))
                                (recur (inc tries)))))))

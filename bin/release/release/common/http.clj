(ns release.common.http
  (:require [clj-http.client :as http]
            [metabuild-common.core :as u]))

(defn check-url-exists [url]
  (u/step (format "Check that %s exists" url)
    (let [status-code (:status (http/head url))]
      (u/announce "Fetched with status code %d" status-code)
      (assert (= status-code 200)))))

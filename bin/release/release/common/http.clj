(ns release.common.http
  (:require [clj-http.client :as http]
            [metabuild-common.core :as u]
            [release.common :as c]))

(defn check-url-exists [url]
  (u/step (format "Check that %s exists" url)
          (let [status-code (:status (http/get (c/artifact-download-url "launch-aws-eb.html")))]
            (u/announce "Fetched with status code %d" status-code)
            (assert (< status-code 400)))))

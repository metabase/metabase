(ns metabase.api.util-test
  "Tests for /api/util"
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as time]]
            [expectations :refer :all]
            [metabase.http-client :refer [client]]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :refer [expect-with-engines]]
             [users :refer :all]]))

;; ## POST /api/util/password_check

;; Test for required params
(expect {:errors {:password "Insufficient password strength"}}
  (client :post 400 "util/password_check" {}))

;; Test complexity check
(expect {:errors {:password "Insufficient password strength"}}
  (client :post 400 "util/password_check" {:password "blah"}))

;; Should be a valid password
(expect {:valid true}
  (client :post 200 "util/password_check" {:password "something1"}))


(defn- validate-time-info [time-info-map]
  (-> time-info-map
      (update :name (comp boolean time/time-zone-for-id))
      (update :offset_time (comp boolean tcoerce/from-string))
      (update :utc_time (comp boolean tcoerce/from-string))))

(def ^:private valid-time-info-map {:name true :offset_time true :utc_time true})

(expect-with-engines #{:h2 :postgres}
  {:server_timezone    valid-time-info-map
   :reporting_timezone nil
   :databases          #{valid-time-info-map}}
  (let [results (data/dataset test-data
                  ((user->client :crowberto) :get 200 "util/troubleshooting_info"))]
    (-> results
        (update :server_timezone validate-time-info)
        (update :databases #(set (map validate-time-info %))))))

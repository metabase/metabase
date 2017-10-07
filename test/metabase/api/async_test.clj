(ns metabase.api.async-test
  "Tests for /api/async endpoints."
  (:require  [expectations :refer :all]
             [metabase.test.data :as data :refer :all]
             [metabase.test.data.users :refer :all]))

(expect
  true
  (-> ((user->client :crowberto) :get 200 (str "x-ray/field/" (id :venues :price)))
      :job-id
      number?))

(expect
  true
  (let [job-id (:job-id ((user->client :crowberto) :get 200
                         (str "x-ray/field/" (id :venues :price))))]
    (loop [tries 0]
      (let [{:keys [status result]} ((user->client :crowberto) :get 200 (str "async/" job-id))]
        (cond
          (= "done" status) (contains? result :features)
          (> tries 100)     (throw (ex-info "Timeout. Max retries exceeded."))
          :else             (do
                              (Thread/sleep 100)
                              (recur (inc tries))))))))

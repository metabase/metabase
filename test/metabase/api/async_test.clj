(ns metabase.api.async-test
  "Tests for /api/async endpoints."
  (:require [expectations :refer :all]
            [metabase.test.async :refer [result!]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]))

(expect
  true
  (-> ((user->client :rasta) :get 200 (str "x-ray/field/" (id :venues :price)))
      :job-id
      number?))

(expect
  true
  (let [client (user->client :rasta)
        job-id (:job-id (client :get 200 (str "x-ray/field/" (id :venues :price))))]
    (result! job-id)
    (-> (client :get 200 (str "async/" job-id))
        :result
        (contains? :features))))

(ns metabase.api.async-test
  "Tests for /api/async endpoints."
  (:require [expectations :refer :all]
            [metabase.test.async :refer :all]
            [metabase.test.data :refer :all :as data]
            [metabase.test.data.users :refer :all]))

(expect
  true
  (-> ((user->client :rasta) :get 200 (str "x-ray/field/" (id :venues :price)))
      :job-id
      number?))

(expect
  true
  (contains? (->> ((user->client :rasta) :get 200
                   (str "x-ray/field/" (id :venues :price)))
                  :job-id
                  (call-with-retries :rasta))
             :features))

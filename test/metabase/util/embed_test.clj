(ns metabase.util.embed-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest maybe-populate-initially-published-at-test
  (let [now #t "2022-09-01T12:34:56Z"]
    (doseq [model [:model/Card :model/Dashboard]]
      (testing "should populate `initially_published_at` when a Card's enable_embedding is changed to true"
        (mt/with-temp [model card {:enable_embedding false}]
          (is (nil? (:initially_published_at card)))
          (t2/update! model (u/the-id card) {:enable_embedding true})
          (is (some? (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when a Card's enable_embedding is changed to false"
        (mt/with-temp [model card {:enable_embedding true :initially_published_at now}]
          (is (some? (:initially_published_at card)))
          (t2/update! model (u/the-id card) {:enable_embedding false})
          (is (= (t/offset-date-time now) (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when `enable_embedding` is already set to true"
        (mt/with-temp [model card {:enable_embedding true :initially_published_at now}]
          (t2/update! model (u/the-id card) {:enable_embedding true})
          (is (= (t/offset-date-time now) (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when `enable_embedding` is already set to false"
        (mt/with-temp [model card {:enable_embedding false}]
          (is (nil? (:initially_published_at card)))
          (t2/update! model (u/the-id card) {:enable_embedding false})
          (is (nil? (t2/select-one-fn :initially_published_at model :id (u/the-id card)))))))))

(ns metabase.lib.page-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel current-page-test
  (let [query (lib.tu/venues-query)]
    (testing "returns nil when no page is set"
      (is (nil? (lib/current-page query)))
      (is (nil? (lib/current-page query -1))))
    (testing "returns page when set"
      (let [page {:page 2, :items 10}
            query-with-page (lib/with-page query page)]
        (is (= page (lib/current-page query-with-page)))
        (is (= page (lib/current-page query-with-page -1)))))))

(deftest ^:parallel current-page-explicit-stage-test
  (testing "explicit stage number"
    (let [query (-> (lib.tu/venues-query)
                    lib/append-stage)]
      (is (nil? (lib/current-page query 0)))
      (is (nil? (lib/current-page query 1)))
      (let [query-with-page (lib/with-page query 0 {:page 1, :items 5})]
        (is (= {:page 1, :items 5} (lib/current-page query-with-page 0)))
        (is (nil? (lib/current-page query-with-page 1)))))))

(deftest ^:parallel current-page-1-arity-targets-last-stage-test
  (testing "1-arity current-page targets the last stage in multi-stage query"
    (let [query (-> (lib.tu/venues-query)
                    lib/append-stage)
          ;; Set page on stage 0 (first stage)
          query-page-on-0 (lib/with-page query 0 {:page 1, :items 5})
          ;; Set page on stage 1 (last stage)
          query-page-on-1 (lib/with-page query 1 {:page 2, :items 10})]
      ;; 1-arity should return nil when page is only on stage 0
      (is (nil? (lib/current-page query-page-on-0)))
      ;; 1-arity should return the page when it's on the last stage
      (is (= {:page 2, :items 10} (lib/current-page query-page-on-1))))))

(deftest ^:parallel with-page-test
  (let [query (lib.tu/venues-query)
        page {:page 1, :items 10}]
    (testing "sets page on query"
      (let [result (lib/with-page query page)]
        (is (= page (get-in result [:stages 0 :page])))))
    (testing "removes page when nil"
      (let [query-with-page (lib/with-page query page)
            result (lib/with-page query-with-page nil)]
        (is (nil? (get-in result [:stages 0 :page])))))
    (testing "page value is passed through correctly"
      (let [page2 {:page 3, :items 25}
            result (lib/with-page query page2)]
        (is (= page2 (lib/current-page result)))))))

(deftest ^:parallel with-page-explicit-stage-test
  (testing "explicit stage number"
    (let [query (-> (lib.tu/venues-query)
                    lib/append-stage)
          page {:page 2, :items 15}]
      (let [result (lib/with-page query 0 page)]
        (is (= page (get-in result [:stages 0 :page])))
        (is (nil? (get-in result [:stages 1 :page]))))
      (let [result (lib/with-page query 1 page)]
        (is (nil? (get-in result [:stages 0 :page])))
        (is (= page (get-in result [:stages 1 :page])))))))

(deftest ^:parallel with-page-2-arity-targets-last-stage-test
  (testing "2-arity with-page targets the last stage in multi-stage query"
    (let [query (-> (lib.tu/venues-query)
                    lib/append-stage)
          page {:page 3, :items 20}
          result (lib/with-page query page)]
      ;; 2-arity should set page on the last stage (stage 1), not the first (stage 0)
      (is (nil? (get-in result [:stages 0 :page])))
      (is (= page (get-in result [:stages 1 :page]))))))

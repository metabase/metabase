(ns metabase-enterprise.transforms.jobs-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.jobs :as jobs]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase.test :as mt]
   [metabase.util.log :as log]))

(deftest basic-deps-test
  (let [ordering {1 #{2 3}
                  2 #{3 4}
                  3 #{}
                  4 #{5}
                  5 #{}
                  6 #{7 8}
                  7 #{}
                  8 #{}}]
    (is (= #{1 2 3 4 5}
           (#'jobs/get-deps ordering [1])))
    (is (= #{1 2 3 4 5 6 7 8}
           (#'jobs/get-deps ordering [1 6])))
    (is (= #{2 3 4 5 6 7 8}
           (#'jobs/get-deps ordering [2 6])))
    (is (= #{1 2 3 4 5}
           (#'jobs/get-deps ordering [1 2 3])))))

(deftest cycle-deps-test
  (let [ordering {1 #{2}
                  2 #{3}
                  3 #{1}}]
    (is (= #{1 2 3}
           (#'jobs/get-deps ordering [1])))))

(deftest next-transform-test
  (let [ordering {1 #{2 3}
                  2 #{3 4}
                  3 #{}
                  4 #{5}
                  5 #{}
                  6 #{7 8}
                  7 #{}
                  8 #{}}
        transforms-by-id {1 {:id 1 :created_at #t "2025-01-01T01:01:01"}
                          2 {:id 2 :created_at #t "2025-01-01T01:01:05"}
                          3 {:id 3 :created_at #t "2025-01-01T01:01:04"}
                          4 {:id 4 :created_at #t "2025-01-01T01:01:03"}
                          5 {:id 5 :created_at #t "2025-01-01T01:01:02"}
                          6 {:id 6 :created_at #t "2025-01-01T01:01:06"}
                          7 {:id 7 :created_at #t "2025-01-01T01:01:07"}
                          8 {:id 8 :created_at #t "2025-01-01T01:01:08"}}
        sorted-ordering (#'jobs/sorted-ordering ordering transforms-by-id)]
    (is (= 5
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{})
               :id)))
    (is (= 4
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{5})
               :id)))
    (is (= 1
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{2 3 4 5 6 7 8})
               :id)))
    (is (nil? (#'jobs/next-transform sorted-ordering transforms-by-id #{1 2 3 4 5 6 7 8})))))

(deftest next-transform-same-created-at-test
  (let [ordering {1 #{2 3}
                  2 #{}
                  3 #{}}
        transforms-by-id {1 {:id 1 :created_at #t "2025-01-01T01:01:01"}
                          2 {:id 2 :created_at #t "2025-01-01T01:01:01"}
                          3 {:id 3 :created_at #t "2025-01-01T01:01:01"}}
        sorted-ordering (#'jobs/sorted-ordering ordering transforms-by-id)]
    (is (= 2
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{})
               :id)))
    (is (= 3
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{2})
               :id)))
    (is (= 1
           (-> (#'jobs/next-transform sorted-ordering transforms-by-id #{2 3})
               :id)))
    (is (nil? (#'jobs/next-transform sorted-ordering transforms-by-id #{1 2 3})))))

(def ^:private query-source {:type "query"})
(def ^:private python-source {:type "python"})

(deftest run-transform-feature-flag-test
  (testing "Query transforms are skipped without :transforms feature"
    (mt/with-premium-features #{}
      (let [query-transform {:id   1
                             :source query-source
                             :name "Test Query Transform"}
            run-id 100
            logged-warnings (atom [])]
        ;; Mock the log/warnf function to capture warnings
        (mt/with-dynamic-fn-redefs [log/warnf (fn [msg & args]
                                                (swap! logged-warnings conj (apply format msg args)))
                                    transform-run/running-run-for-transform-id (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled query-transform)
          (is (= 1 (count @logged-warnings))
              "Should log exactly one warning")
          (is (re-matches #".*Skip running transform 1 due to lacking premium features.*"
                          (first @logged-warnings))
              "Warning message should indicate transform was skipped due to missing features")))))

  (testing "Python transforms are skipped without :transforms-python feature"
    (mt/with-premium-features #{:transforms}
      (let [python-transform {:id   2
                              :source python-source
                              :name "Test Python Transform"}
            run-id 101
            logged-warnings (atom [])]
        (mt/with-dynamic-fn-redefs [log/warnf (fn [msg & args]
                                                (swap! logged-warnings conj (apply format msg args)))
                                    transform-run/running-run-for-transform-id (constantly nil)]
          (#'jobs/run-transform! run-id :scheduled python-transform)
          (is (= 1 (count @logged-warnings))
              "Should log exactly one warning")
          (is (re-matches #".*Skip running transform 2 due to lacking premium features.*"
                          (first @logged-warnings))
              "Warning message should indicate transform was skipped due to missing features")))))

  (testing "Query transforms run with :transforms feature"
    (mt/with-premium-features #{:transforms}
      (let [query-transform {:id   3
                             :source query-source
                             :name "Test Query Transform"}
            run-id 102
            logged-warnings (atom [])
            run-called? (atom false)]
        (mt/with-dynamic-fn-redefs [log/warnf (fn [msg & args]
                                                (swap! logged-warnings conj (apply format msg args)))
                                    transform-run/running-run-for-transform-id (constantly nil)
                                    transforms.execute/run-mbql-transform! (fn [_ _]
                                                                             (reset! run-called? true))]
          (#'jobs/run-transform! run-id :scheduled query-transform)
          (is (empty? @logged-warnings)
              "Should not log warnings when feature is enabled")
          (is @run-called?
              "Should call run-mbql-transform! when feature is enabled"))))))

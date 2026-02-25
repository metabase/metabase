(ns metabase.transforms.schema-test
  "Schema validation tests for runner-based transform sources."
  (:require
   [clojure.test :refer :all]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private runner-languages
  [:python :javascript :clojure :r :julia])

(def ^:private valid-runner-source
  {:source-database 1
   :source-tables {"t1" 100}
   :body "some code"})

;;; ---------------------------------------- Valid runner sources ---------------------------------------------------

(deftest runner-source-validates-for-all-languages-test
  (doseq [lang runner-languages]
    (testing (str lang " source validates")
      (is (true? (mr/validate ::transforms.schema/transform-source
                              (assoc valid-runner-source :type lang)))))))

(deftest runner-source-with-table-ref-validates-test
  (doseq [lang runner-languages]
    (testing (str lang " with table ref source-tables validates")
      (is (true? (mr/validate ::transforms.schema/transform-source
                              (assoc valid-runner-source
                                     :type lang
                                     :source-tables {"t1" {:database_id 1
                                                           :schema "public"
                                                           :table "foo"}})))))))

(deftest runner-source-with-incremental-strategy-validates-test
  (doseq [lang runner-languages]
    (testing (str lang " with optional incremental strategy validates")
      (is (true? (mr/validate ::transforms.schema/transform-source
                              (assoc valid-runner-source
                                     :type lang
                                     :source-incremental-strategy
                                     {:type "checkpoint"
                                      :checkpoint {:type "checkpoint"}})))))))

(deftest runner-source-optional-source-database-test
  (doseq [lang runner-languages]
    (testing (str lang " without source-database validates (it's optional)")
      (is (true? (mr/validate ::transforms.schema/transform-source
                              (-> valid-runner-source
                                  (dissoc :source-database)
                                  (assoc :type lang))))))))

;;; ---------------------------------------- Invalid runner sources ------------------------------------------------

(deftest runner-source-missing-body-invalid-test
  (doseq [lang runner-languages]
    (testing (str lang " without :body is invalid")
      (is (false? (mr/validate ::transforms.schema/transform-source
                               (-> valid-runner-source
                                   (dissoc :body)
                                   (assoc :type lang))))))))

(deftest runner-source-missing-source-tables-invalid-test
  (doseq [lang runner-languages]
    (testing (str lang " without :source-tables is invalid")
      (is (false? (mr/validate ::transforms.schema/transform-source
                               (-> valid-runner-source
                                   (dissoc :source-tables)
                                   (assoc :type lang))))))))

(deftest runner-source-wrong-body-type-invalid-test
  (doseq [lang runner-languages]
    (testing (str lang " with non-string :body is invalid")
      (is (false? (mr/validate ::transforms.schema/transform-source
                               (assoc valid-runner-source :type lang :body 42)))))))

(deftest unknown-source-type-invalid-test
  (testing "unknown source type is invalid"
    (is (false? (mr/validate ::transforms.schema/transform-source
                             (assoc valid-runner-source :type :cobol))))))

;;; ---------------------------------------- Query source ----------------------------------------------------------

(deftest query-source-not-confused-with-runner-test
  (testing "a runner-shaped source with :type :query does not validate as runner"
    (is (false? (mr/validate ::transforms.schema/transform-source
                             (assoc valid-runner-source :type :query))))))

;;; ---------------------------------------- Shape equivalence across languages ------------------------------------

(deftest all-runner-languages-accept-same-shape-test
  (testing "the exact same map (minus :type) validates for every runner language"
    (let [base (dissoc valid-runner-source :type)]
      (doseq [lang runner-languages]
        (testing (str lang)
          (is (true? (mr/validate ::transforms.schema/transform-source
                                  (assoc base :type lang)))))))))

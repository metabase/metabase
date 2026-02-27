(ns metabase-enterprise.transforms-runner.feature-gating-test
  "Tests for feature gating that depend on runner language registration.
  Pure predicate tests live in metabase.transforms.feature-gating-test (OSS)."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.util]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [thunk]
                      (doseq [lang [:python :javascript :clojure]]
                        (transforms.i/register-runner! lang))
                      (thunk)))

(def ^:private runner-languages
  [:python :javascript :clojure])

(defn- make-transform [source-type]
  {:source {:type (name source-type)}
   :target {:database 1 :type "table" :name "out" :schema "s"}})

(deftest enabled-source-types-full-features-test
  (mt/with-premium-features #{:transforms :transforms-python}
    (let [types (transforms.gating/enabled-source-types)]
      (testing "includes query types"
        (is (contains? types "native"))
        (is (contains? types "mbql")))
      (testing "includes python"
        (is (contains? types "python")))
      (testing "includes all runner languages"
        (doseq [lang (transforms.gating/runner-language-types)]
          (testing (str "includes " lang)
            (is (contains? types lang))))))))

(deftest check-feature-enabled-full-features-test
  (mt/with-premium-features #{:transforms :transforms-python}
    (testing "query transform enabled"
      (is (true? (transforms.util/check-feature-enabled (make-transform :query)))))
    (testing "all runner languages enabled"
      (doseq [lang runner-languages]
        (testing (str "language: " lang)
          (is (true? (transforms.util/check-feature-enabled (make-transform lang)))))))))

(deftest check-feature-enabled-no-python-feature-test
  (mt/with-premium-features #{:transforms}
    (testing "query transform still enabled"
      (is (true? (transforms.util/check-feature-enabled (make-transform :query)))))
    (testing "python disabled without :transforms-python"
      (is (false? (transforms.util/check-feature-enabled (make-transform :python)))))
    (testing "other runner languages disabled without :transforms-python"
      (doseq [lang [:javascript :clojure]]
        (testing (str "language: " lang)
          (is (false? (transforms.util/check-feature-enabled (make-transform lang)))))))))

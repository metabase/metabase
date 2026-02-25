(ns metabase.transforms.feature-gating-test
  "Tests for feature gating of polyglot transforms."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.util :as transforms.util]))

(set! *warn-on-reflection* true)

(def ^:private runner-languages
  [:python :javascript :clojure :r :julia])

(defn- make-transform [source-type]
  {:source {:type (name source-type)}
   :target {:database 1 :type "table" :name "out" :schema "s"}})

;;; ---------------------------------------- Feature flag predicates ------------------------------------------------

(deftest no-features-test
  (testing "with no premium features"
    (mt/with-premium-features #{}
      (testing "query transforms are enabled (OSS)"
        (is (true? (transforms.gating/query-transforms-enabled?))))
      (testing "python transforms are disabled"
        (is (false? (transforms.gating/python-transforms-enabled?))))
      (testing "runner transforms are disabled"
        (is (false? (transforms.gating/runner-transforms-enabled?)))))))

(deftest transforms-only-test
  (testing "with only :transforms feature"
    (mt/with-premium-features #{:transforms}
      (testing "query transforms are enabled"
        (is (true? (transforms.gating/query-transforms-enabled?))))
      (testing "python transforms need :transforms-python too"
        (is (false? (transforms.gating/python-transforms-enabled?))))
      (testing "runner transforms need :transforms-python too"
        (is (false? (transforms.gating/runner-transforms-enabled?)))))))

(deftest full-features-test
  (testing "with :transforms and :transforms-python"
    (mt/with-premium-features #{:transforms :transforms-python}
      (is (true? (transforms.gating/query-transforms-enabled?)))
      (is (true? (transforms.gating/python-transforms-enabled?)))
      (is (true? (transforms.gating/runner-transforms-enabled?))))))

;;; ---------------------------------------- enabled-source-types --------------------------------------------------

(deftest enabled-source-types-no-features-test
  (mt/with-premium-features #{}
    (is (= #{"native" "mbql"} (transforms.gating/enabled-source-types)))))

(deftest enabled-source-types-transforms-only-test
  (mt/with-premium-features #{:transforms}
    (is (= #{"native" "mbql"} (transforms.gating/enabled-source-types)))))

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

;;; ---------------------------------------- any-transforms-enabled? -----------------------------------------------

(deftest any-transforms-enabled-test
  (mt/with-premium-features #{}
    (testing "always true in non-hosted (OSS) mode"
      (is (true? (transforms.gating/any-transforms-enabled?)))))
  (mt/with-premium-features #{:transforms :transforms-python}
    (is (true? (transforms.gating/any-transforms-enabled?)))))

;;; ---------------------------------------- check-feature-enabled -------------------------------------------------

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
      (doseq [lang [:javascript :clojure :r :julia]]
        (testing (str "language: " lang)
          (is (false? (transforms.util/check-feature-enabled (make-transform lang)))))))))

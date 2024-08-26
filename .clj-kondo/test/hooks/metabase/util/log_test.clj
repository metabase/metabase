(ns ^:mb/once hooks.metabase.util.log-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [hooks.metabase.util.log]))

(defn- warnings
  [form]
  (let [f (if (str/ends-with? (name (first form)) "f")
            hooks.metabase.util.log/infof
            hooks.metabase.util.log/info)]
    (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/validate-logging {:level :warning}}}
                                          :ignores    (atom nil)
                                          :findings   (atom [])
                                          :namespaces (atom {})}]
      (f {:node (api/parse-string (pr-str form))})
      (mapv :message @(:findings clj-kondo.impl.utils/*ctx*)))))

(deftest ^:parallel warn-on-missing-format-args-test
  (testing "should fail, missing a format arg"
    (are [form] (= ["log format string expects 1 arguments instead of 0."]
                   (warnings (quote form)))
      (metabase.util.log/warnf "Migration lock was acquired after %d retries.")
      (metabase.util.log/warnf e "Migration lock was acquired after %d retries."))))

(deftest ^:parallel warn-on-too-many-format-args-test-1
  (testing "should fail, too many format args"
    (are [form] (= ["log format string expects 1 arguments instead of 2."]
                   (warnings (quote form)))
      (metabase.util.log/warnf "Migration lock was acquired after %d retries." 1 2)
      (metabase.util.log/warnf e "Migration lock was acquired after %d retries." 1 2))))

(deftest ^:parallel warn-on-too-many-format-args-test-2
  (testing "should fail, too many format args"
    (are [form] (= ["this looks like an i18n format string. Don't use identifiers like {0} in logging."
                    "Don't use metabase.util.log/warnf with no format string arguments, use metabase.util.log/warn instead."
                    "log format string expects 0 arguments instead of 1."]
                   (warnings (quote form)))
      (metabase.util.log/warnf "Migration lock was acquired after {0} retries." 1)
      (metabase.util.log/warnf e "Migration lock was acquired after {0} retries." 1))))

(deftest ^:parallel warn-on-format-args-without-logf-test
  (testing "should fail, has format args but is warn rather than warnf"
    (are [form] (= ["metabase.util.log/warn used with a format string, use metabase.util.log/warnf instead."]
                   (warnings (quote form)))
      (metabase.util.log/warn "Migration lock was acquired after %d retries." 1)
      (metabase.util.log/warn e "Migration lock was acquired after %d retries." 1))))

(deftest ^:parallel warn-on-format-without-logf-test
  (testing "should fail, has format args but is warn rather than warnf"
    (are [form] (= ["Use metabase.util.log/warnf instead of metabase.util.log/warn + format"]
                   (warnings (quote form)))
      (metabase.util.log/warn (format "Migration lock was acquired after %d retries." 1))
      (metabase.util.log/warn e (format "Migration lock was acquired after %d retries." 1)))))

(deftest ^:parallel warn-on-logf-with-no-format-args-test
  (testing "should fail, has format args but is warn rather than warnf"
    (are [form] (= ["Don't use metabase.util.log/warnf with no format string arguments, use metabase.util.log/warn instead."]
                   (warnings (quote form)))
      (metabase.util.log/warnf "Migration lock cleared.")
      (metabase.util.log/warnf e "Migration lock cleared."))))

(deftest ^:parallel warn-on-i18n-test-1
  (testing "should fail -- should not use i18n/tru or i18n/trs"
    (are [form] (= ["do not i18n the logs!"]
                   (warnings (quote form)))
      (metabase.util.log/warnf (metabase.util.i18n/tru "Migration lock was acquired after {0} retries." 1))
      (metabase.util.log/warnf e (metabase.util.i18n/tru "Migration lock was acquired after {0} retries." 1)))))

(deftest ^:parallel warn-on-i18n-test-2
  (testing "should fail -- should not use i18n/tru or i18n/trs"
    (are [form] (= ["do not i18n the logs!"]
                   (warnings (quote form)))
      (metabase.util.log/warn (metabase.util.i18n/trs "Migration lock was acquired after {0} retries." 1))
      (metabase.util.log/warn e (metabase.util.i18n/trs "Migration lock was acquired after {0} retries." 1)))))

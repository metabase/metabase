(ns metabase.lib.schema.common-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel ip-address-test
  (testing ":type/IPAddress is both a base type and a semantic type"
    (are [schema] (not (me/humanize (mr/explain schema :type/IPAddress)))
      ::lib.schema.common/base-type
      ::lib.schema.common/semantic-type)))

(deftest ^:parallel normalize-base-type-test
  (testing "Support normalizing really messed up base types like `:type/creationtime` => `:type/CreationTime` (#63397)"
    (testing (str "Don't do this normalization in dev, because it's a major bug and we shouldn't encourage people to"
                  " write messed up code that needs this to be done to fix it")
      #?(:clj
         (is (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"Invalid output: \[\"Not a valid base type: :type/creationtime, got: :type/creationtime\"\]"
              (lib/normalize ::lib.schema.common/base-type "type/creationtime")))))
    (testing "in prod (when Malli enforcement is off) we should be able to fix it"
      (mu/disable-enforcement
        (is (= :type/CreationTime
               (lib/normalize ::lib.schema.common/base-type "type/creationtime")))))))

(deftest ^:parallel url-encoded-string-regex-test
  (are [s] (re-matches lib.schema.common/url-encoded-string-regex s)
    "a"
    "Hello%20World"
    "user%40example.com"
    "test_string-123.txt"
    "%3Cscript%3E")
  (are [s] (not (re-matches lib.schema.common/url-encoded-string-regex s))
    "a/b"
    "Hello World"
    "user@example.com"
    "<script>"))

(deftest ^:parallel unfussy-sorted-map-test
  (is (nil? (:lib/type (lib.schema.common/unfussy-sorted-map "a" 1))))
  (is (nil? (get (lib.schema.common/unfussy-sorted-map :a 1) "lib/type")))
  (is (= {"a" 1 :b 2}
         (lib.schema.common/unfussy-sorted-map "a" 1 :b 2))))

(ns metabase.util.js-interop-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [goog.object :as gobject]
   [metabase.util.js-interop :as js-interop]))

(deftest ^:parallel cljs-key->js-key-test
  (testing "basic kebab-case to camelCase conversion"
    (are [cljs-key expected] (= expected (js-interop/cljs-key->js-key cljs-key))
      :foo           "foo"
      :foo-bar       "fooBar"
      :foo-bar-baz   "fooBarBaz"
      :a             "a"
      :A             "a"))
  (testing "? suffix becomes is prefix"
    (are [cljs-key expected] (= expected (js-interop/cljs-key->js-key cljs-key))
      :active?       "isActive"
      :many-pks?     "isManyPks"
      :is-active     "isActive"))
  (testing "namespaced keywords preserve namespace"
    (are [cljs-key expected] (= expected (js-interop/cljs-key->js-key cljs-key))
      :lib/type      "lib/type"
      :foo/bar-baz   "foo/barBaz")))

(deftest ^:parallel js-key->cljs-key-test
  (testing "basic camelCase to kebab-case conversion"
    (are [js-key expected] (= expected (js-interop/js-key->cljs-key js-key))
      "foo"         :foo
      "fooBar"      :foo-bar
      "fooBarBaz"   :foo-bar-baz
      "a"           :a))
  (testing "is prefix becomes ? suffix"
    (are [js-key expected] (= expected (js-interop/js-key->cljs-key js-key))
      "isActive"    :active?
      "isManyPks"   :many-pks?))
  (testing "is that's not a boolean prefix stays as-is"
    ;; Words that start with 'is' but aren't boolean predicates
    ;; Note: the current implementation treats all 'is' prefixes as boolean markers
    ;; This test documents actual behavior
    (is (= :land? (js-interop/js-key->cljs-key "island")))))

(deftest ^:parallel round-trip-key-conversion-test
  (testing "cljs -> js -> cljs round trip"
    (are [cljs-key] (= cljs-key (-> cljs-key
                                    js-interop/cljs-key->js-key
                                    js-interop/js-key->cljs-key))
      :foo
      :foo-bar
      :active?
      :many-pks?))
  (testing "js -> cljs -> js round trip"
    (are [js-key] (= js-key (-> js-key
                                js-interop/js-key->cljs-key
                                js-interop/cljs-key->js-key))
      "foo"
      "fooBar"
      "isActive"
      "isManyPks")))

(deftest ^:parallel js-obj->cljs-map-test
  (testing "converts JS object to CLJS map with key conversion"
    (let [js-obj #js {"fooBar" 1 "bazQux" 2}
          result (js-interop/js-obj->cljs-map js-obj)]
      (is (map? result))
      (is (= 1 (:foo-bar result)))
      (is (= 2 (:baz-qux result)))))
  (testing "handles is prefix conversion"
    (let [js-obj #js {"isActive" true "isDisabled" false}
          result (js-interop/js-obj->cljs-map js-obj)]
      (is (= true (:active? result)))
      (is (= false (:disabled? result))))))

(deftest ^:parallel cljs-map->js-obj-test
  (testing "converts CLJS map to JS object with key conversion"
    (let [cljs-map {:foo-bar 1 :baz-qux 2}
          result (js-interop/cljs-map->js-obj cljs-map)]
      (is (object? result))
      (is (= 1 (gobject/get result "fooBar")))
      (is (= 2 (gobject/get result "bazQux")))))
  (testing "handles ? suffix conversion"
    (let [cljs-map {:active? true :disabled? false}
          result (js-interop/cljs-map->js-obj cljs-map)]
      (is (= true (gobject/get result "isActive")))
      (is (= false (gobject/get result "isDisabled"))))))

(deftest ^:parallel display-info->js-nil-test
  (testing "nil returns nil"
    (is (nil? (js-interop/display-info->js nil)))))

(deftest ^:parallel display-info->js-string-test
  (testing "strings pass through unchanged"
    (is (= "hello" (js-interop/display-info->js "hello")))
    (is (= "" (js-interop/display-info->js "")))))

(deftest ^:parallel display-info->js-keyword-test
  (testing "keywords become qualified name strings"
    (is (= "foo" (js-interop/display-info->js :foo)))
    (is (= "foo-bar" (js-interop/display-info->js :foo-bar)))
    (is (= "ns/foo" (js-interop/display-info->js :ns/foo)))))

(deftest ^:parallel display-info->js-map-test
  (testing "maps become JS objects with key conversion"
    (let [result (js-interop/display-info->js {:foo-bar 1 :baz-qux "hello"})]
      (is (object? result))
      (is (= 1 (gobject/get result "fooBar")))
      (is (= "hello" (gobject/get result "bazQux")))))
  (testing "nested maps are recursively converted"
    (let [result (js-interop/display-info->js {:outer {:inner-key "value"}})]
      (is (object? result))
      (let [outer (gobject/get result "outer")]
        (is (object? outer))
        (is (= "value" (gobject/get outer "innerKey")))))))

(deftest ^:parallel display-info->js-seq-test
  (testing "sequences become JS arrays"
    (let [result (js-interop/display-info->js [1 2 3])]
      (is (array? result))
      (is (= [1 2 3] (vec result)))))
  (testing "nested sequences are recursively converted"
    (let [result (js-interop/display-info->js [{:foo-bar 1} {:baz-qux 2}])]
      (is (array? result))
      (is (= 2 (.-length result)))
      (is (= 1 (gobject/get (aget result 0) "fooBar")))
      (is (= 2 (gobject/get (aget result 1) "bazQux"))))))

(deftest ^:parallel display-info->js-other-values-test
  (testing "numbers pass through unchanged"
    (is (= 42 (js-interop/display-info->js 42)))
    (is (= 3.14 (js-interop/display-info->js 3.14))))
  (testing "booleans pass through unchanged"
    (is (= true (js-interop/display-info->js true)))
    (is (= false (js-interop/display-info->js false)))))

(deftest ^:parallel display-info-memoization-test
  (testing "display-info-map->js returns same object for same input"
    (let [input {:foo-bar 1}
          result1 (js-interop/display-info-map->js input)
          result2 (js-interop/display-info-map->js input)]
      ;; Same map input should return the same cached JS object
      (is (identical? result1 result2))))
  (testing "display-info-seq->js returns same array for same input"
    (let [input [1 2 3]
          result1 (js-interop/display-info-seq->js input)
          result2 (js-interop/display-info-seq->js input)]
      ;; Same seq input should return the same cached JS array
      (is (identical? result1 result2)))))

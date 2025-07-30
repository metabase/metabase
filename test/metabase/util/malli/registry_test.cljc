(ns metabase.util.malli.registry-test
  (:require
   #?@(:clj
       ([metabase.util.i18n :as i18n]))
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli.registry :as mr]))

(defn- clear-cache []
  (reset! @#'mr/cache {}))

(use-fixtures :each (fn [t] (clear-cache) (t)))

(defmacro ^:private with-returning-cache-misses [& body]
  `(let [cache-misses# (volatile! [])]
     (binding [mr/*cache-miss-hook* (fn [k# schema# _#]
                                      (vswap! cache-misses# conj [k# schema#]))]
       ~@body)
     @cache-misses#))

(deftest ^:parallel validation-with-unique-schemas-grows-cache
  (is (= 1 (count (with-returning-cache-misses (mr/validate [:int {:special (rand)}] 1))))))

(deftest ^:parallel validation-with-non-unique-schemas-does-not
  (let [skema [:int {:special (rand)}]]
    (is (= 1 (count (with-returning-cache-misses (mr/validate skema 1)))))
    (is (= 0 (count (with-returning-cache-misses
                      (dotimes [_ 20] (mr/validate skema 1))))))))

(deftest ^:parallel explaination-with-unique-schemas-grows-cache
  (is (= 1 (count (with-returning-cache-misses (mr/explain [:int {:special (rand)}] "hi"))))))

(deftest ^:parallel explaination-with-non-unique-schemas-does-not
  (let [skema [:int {:special (rand)}]]
    (is (= 1 (count (with-returning-cache-misses (mr/explain skema "hi")))))
    (is (= 0 (count (with-returning-cache-misses
                      (dotimes [_ 20] (mr/explain skema "hi"))))))))

(deftest ^:parallel cache-handle-regexes-test
  (testing (str "For things that aren't ever equal when you re-evaluate them (like Regex literals) maybe sure we do"
                " something smart to avoid creating infinite cache entries")
    (mr/validate [:re #"\d{4}"] "1234")
    (:validator @@#'mr/cache)
    (let [before-count (count (:validator @@#'mr/cache))]
      (mr/validate [:re #"\d{4}"] "1234")
      (mr/validate [:re #"\d{4}"] "1234")
      (is (= (count (:validator @@#'mr/cache))
             before-count)))))

(mr/def ::int
  :int)

(deftest ^:parallel explainer-test
  (is (= ["should be an integer"]
         (me/humanize (mr/explain ::int "1"))
         (me/humanize (mr/explain [:schema ::int] "1"))
         (me/humanize ((mr/explainer ::int) "1"))
         (me/humanize ((mr/explainer [:schema ::int]) "1"))))
  (testing "cache explainers"
    (is (identical? (mr/explainer ::int)
                    (mr/explainer ::int)))))

(deftest schema-caching-test
  (let [misses (with-returning-cache-misses
                 (is (identical? (mr/explainer (mr/with-key [:fn (some-fn :x :y)]))
                                 (mr/explainer (mr/with-key [:fn (some-fn :x :y)]))))
                 (is (nil? (mr/explain (mr/with-key [:fn (some-fn :x :y)])
                                       {:x true}))))]
    (is (= 1 (count misses))))

  (let [misses (with-returning-cache-misses
                 (is (identical? (mr/explainer (mr/with-key [:fn (fn [x] ((some-fn :x :y) x))]))
                                 (mr/explainer (mr/with-key [:fn (fn [x] ((some-fn :x :y) x))]))))
                 (is (nil? (mr/explain (mr/with-key [:fn (fn [x] ((some-fn :x :y) x))])
                                       {:x true}))))]
    (is (= 1 (count misses))))

  (let [misses (with-returning-cache-misses
                 (is (not ;; FIXME -- reader macro functions are read and eval'd before
                          ;; being passed to the mr/with-key macro, so they are not
                          ;; identical? to each other, and we can't cache them.
                      (identical? (mr/explainer (mr/with-key [:fn #(even? %)]))
                                  (mr/explainer (mr/with-key [:fn #(even? %)])))))
                 (is (nil? (mr/explain (mr/with-key [:fn #(even? %)]) 2))))]
    ;; 3 #(fn ...) => 3 misses, because each of the three
    ;; functions is a different instance
    (is (= 3 (count misses)))))

(deftest ^:parallel resolve-test
  (is (mc/schema? (mr/resolve-schema :int)))
  (is (mc/schema? (mr/resolve-schema ::int)))
  #?(:clj
     (is (= ":int"
            (pr-str (mr/resolve-schema ::int))
            (pr-str (mr/resolve-schema [:ref ::int]))))))

#?(:clj
   (deftest ^:parallel resolve-should-not-realize-i18n-strings-test
     (testing "resolving a schema should not cause deferred i18n strings to get realized."
       (let [schema [:int {:min 0, :description (i18n/deferred-tru "value must be an integer greater than zero.")}]]
         (letfn [(description [schema]
                   (-> schema mc/properties :description))]
           (is (i18n/localized-string?
                (description schema)))
           (is (i18n/localized-string?
                (description (mr/resolve-schema schema)))))))))

(deftest ^:parallel preserve-schemas-with-properties-test
  (testing "Preserve properties attached to a `:schema` when unwrapping it"
    (is (= [:int {:description "value must be an integer greater than zero.", :min 1}]
           (mc/form (mr/resolve-schema [:schema
                                        {:description "value must be an integer greater than zero."}
                                        [:int {:min 1}]]))))))

(mr/def ::positive-int
  [:int {:min 1}])

(deftest ^:parallel resolve-ref-with-properties-test
  (testing "We should preserve properties attached to a `:ref` when resolving it"
    (is (= [:int {:description "wow", :min 1}]
           (mc/form (mr/resolve-schema [:ref {:description "wow"} ::positive-int]))))))

(mr/def ::positive-int-2
  [:schema {:description "neat"} [:int {:min 1}]])

(deftest ^:parallel recursive-ref-and-schema-resolution-test
  (testing "recursive resolution of refs and schemas with properties -- merge higher-level properties"
    (is (= [:int {:description "wow", :min 1}]
           (mc/form (mr/resolve-schema [:ref {:description "wow"} ::positive-int-2]))))
    (is (= [:int {:description "neat", :min 1}]
           (mc/form (mr/resolve-schema ::positive-int-2))))))

(deftest ^:parallel ok-to-unwrap-schemas-without-properties-test
  (testing "It's ok to unwrap :schema or :ref if properties are empty"
    (are [schema] (= [:int {:min 1}]
                     (mc/form (mr/resolve-schema schema)))
      [:schema [:int {:min 1}]]
      [:ref ::positive-int])))

(mr/def ::location
  [:map
   [:parent {:optional true} [:ref ::location]]
   [:name :string]
   [:id ::positive-int]
   [:id-2 [:schema {:description "another ID"} ::positive-int]]])

(deftest ^:parallel deref-circular-refs-test
  (testing "Don't resolve circular refs"
    (are [schema] (= [:map
                      [:parent {:optional true} [:ref ::location]]
                      [:name :string]
                      [:id [:int {:min 1}]]
                      [:id-2 [:int {:description "another ID", :min 1}]]]
                     (mc/form (mr/resolve-schema schema)))
      ::location
      [:ref ::location])))

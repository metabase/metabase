(ns metabase.util.malli.registry-test
  #?(:cljs (:require-macros
            [metabase.util.malli.registry-test :refer [stable-key?]]))
  (:require
   #?@(:clj ([metabase.util.i18n :as i18n]))
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli.registry :as mr]))

(defn- clear-cache! []
  (reset! @#'mr/cache {}))

(defn cache-size-info []
  (mr/cache-size-info @@#'mr/cache))

(deftest ^:parallel cache-handle-regexes-test
  (testing (str "For things that aren't ever equal when you re-evaluate them (like Regex literals) maybe sure we do"
                " something smart to avoid creating infinite cache entries")
    (is (mr/stable-key? [:re #"\d{4}"]))
    (is (mr/stable-key? [:or [:re #"\d{4}"] [:re #"\d{3}"]]))
    (is (mr/stable-key? [:map [:id [:re #"\d{4}"]] [:name :string]]))))

(deftest ^:parallel cache-handle-fn-test
  (testing "For things that are functions, we should be able to cache them"
    (is (mr/stable-key? [:fn {:error/message "positive number"} pos?]))
    (is (mr/stable-key? [:fn {:error/message "non-blank string"} (complement str/blank?)]))
    (is (mr/stable-key? [:fn {:error/message "the vacuous schema"} (constantly true)]))))

(deftest ^:parallel cache-does-not-handle-inline-anonymous-fn-test
  (testing "Inline anonymous functions are not cachable!"
    (is (not (mr/stable-key? [:fn (fn [s] (if (str/blank? s) false true))])))
    (is (not (mr/stable-key? [:fn {:error/fn (fn [_ _] "no!")} number?])))
    (is (not (mr/stable-key? [:map [:x [:fn (fn [_] false)]]])))))

(mr/def ::int :int)

(deftest ^:parallel explainer-test
  (is (= ["should be an integer"]
         (me/humanize (mr/explain ::int "1"))
         (me/humanize ((mr/explainer ::int) "1"))))
  (testing "cache explainers"
    (is (identical? (mr/explainer ::int)
                    (mr/explainer ::int)))))

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

(deftest ^:parallel cache-function-objects-stability-test
  (testing "Enhanced schema-cache-key function handles function objects to prevent memory leaks"
    (testing "Basic function references should be stable"
      (let [schema [:fn {:description "number check"} number?]]
        (mr/validate schema 42)
        (let [before-count (count (:validator @@#'mr/cache))]
          ;; Multiple evaluations of the same schema should reuse cache
          (mr/validate schema 42)
          (mr/validate schema 42)
          (mr/validate schema 42)
          (is (= (count (:validator @@#'mr/cache))
                 before-count)
              "Basic function references should not create multiple cache entries"))))

    (testing "Function composition should be stable (every-pred)"
      (let [schema [:fn {:error/message "positive number"} (every-pred number? pos?)]]
        (mr/validate schema 42)
        (let [before-count (count (:validator @@#'mr/cache))]
          ;; These used to create new cache entries each time due to function object instability
          (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] 42)
          (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] 42)
          (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] 42)
          (is (= (count (:validator @@#'mr/cache))
                 before-count)
              "Function composition should not create multiple cache entries"))))

    (testing "Complement functions should be stable"
      (let [schema [:fn {:error/message "non-blank string"} (complement str/blank?)]]
        (mr/validate schema "hello")
        (let [before-count (count (:validator @@#'mr/cache))]
          ;; These used to create new cache entries each time
          (do (mr/validate [:fn {:error/message "non-blank string"} (complement str/blank?)] "hello")
              (count (:validator @@#'mr/cache)))
          (mr/validate [:fn {:error/message "non-blank string"} (complement str/blank?)] "hello")
          (is (= (count (:validator @@#'mr/cache))
                 before-count)
              "Complement functions should not create multiple cache entries"))))

    (testing "Constant functions should be stable"
      (let [schema [:fn {:error/message "always false"} (constantly false)]]
        (mr/explain schema "anything") ; This will fail validation, but that's expected
        (let [before-count (count (:explainer @@#'mr/cache))]
          ;; These used to create new cache entries each time
          (mr/explain [:fn {:error/message "always false"} (constantly false)] "anything")
          (mr/explain [:fn {:error/message "always false"} (constantly false)] "anything")
          (is (= (count (:explainer @@#'mr/cache))
                 before-count)
              "Constant functions should not create multiple cache entries"))))

    (testing "Anonymous functions with same reference should be stable"
      (let [pred-fn (fn [x] (and (number? x) (pos? x)))
            schema [:fn {:desc "positive number"} pred-fn]]
        (mr/validate schema 42)
        (let [before-count (count (:validator @@#'mr/cache))]
          ;; Same function reference should reuse cache
          (mr/validate [:fn {:desc "positive number"} pred-fn] 42)
          (mr/validate [:fn {:desc "positive number"} pred-fn] 42)
          (is (= (count (:validator @@#'mr/cache))
                 before-count)
              "Same anonymous function reference should not create multiple cache entries"))))))

(deftest ^:parallel cache-memory-leak-prevention-test
  (testing "Memory leak prevention through stable cache keys"
    (testing "Multiple identical schemas with function composition don't grow cache unboundedly"
      ;; Clear cache first
      (clear-cache!)

      ;; Add multiple "identical" schemas that would have created different cache keys before the fix
      (dotimes [i 20]
        (mr/validate [:fn {:error/message "positive"} (every-pred number? pos?)] (inc i)))

      ;; Should only have 1 validator in cache (plus any others from previous tests)
      (let [validator-cache (:validator @@#'mr/cache)
            our-validators (filter (fn [[k _]]
                                     (and (vector? k)
                                          (= (first k) :fn)
                                          (= (get-in k [1 :error/message]) "positive")))
                                   validator-cache)]
        (is (<= (count our-validators) 2)
            "Should have at most 1-2 cache entries for identical schemas, not 20")))))

(deftest ^:parallel cache-monitoring-functions-test
  (testing "Cache monitoring and management functions work correctly"
    (testing "cache-size-info returns meaningful information"
      (let [cache-info (cache-size-info)]
        (is (contains? cache-info :total-cache-entries))
        (is (contains? cache-info :entries-by-type))
        (is (number? (:total-cache-entries cache-info)))
        (is (map? (:entries-by-type cache-info)))))

    (testing "clear-cache! empties the cache"
      ;; Add some entries first
      (mr/validate :int 42)
      (mr/validate :string "hello")
      (let [before-size (:total-cache-entries (cache-size-info))]
        (is (pos? before-size) "Cache should have some entries before clearing")
        (clear-cache!)
        (let [after-size (:total-cache-entries (cache-size-info))]
          (is (zero? after-size) "Cache should be empty after clearing"))))))

(deftest ^:parallel schema-cache-key-backward-compatibility-test
  (testing "Enhanced schema-cache-key maintains backward compatibility"
    (testing "Regex patterns still work correctly (existing functionality)"
      (let [schema [:re #"\d{4}"]]
        (mr/validate schema "1234")
        (let [before-count (count (:validator @@#'mr/cache))]
          ;; Multiple evaluations should reuse cache (this was already working)
          (mr/validate [:re #"\d{4}"] "1234")
          (mr/validate [:re #"\d{4}"] "1234")
          (is (= (count (:validator @@#'mr/cache))
                 before-count)
              "Regex patterns should continue to work as before"))))

    (testing "Non-function, non-regex schemas still work"
      (let [schema [:and :int [:> 0]]]
        (mr/validate schema 42)
        (let [before-count (count (:validator @@#'mr/cache))]
          (mr/validate [:and :int [:> 0]] 42)
          (mr/validate [:and :int [:> 0]] 42)
          (is (= (count (:validator @@#'mr/cache))
                 before-count)
              "Non-function schemas should continue to work"))))))

(deftest ^:parallel function-object-patterns-test
  (testing "Specific problematic patterns found in Metabase codebase are now stable"
    (testing "MBQL clause validation pattern"
      (let [schema [:fn {:error/message "not a known MBQL clause"} (constantly false)]]
        (mr/explain schema "anything")
        (let [before-count (count (:explainer @@#'mr/cache))]
          (mr/explain [:fn {:error/message "not a known MBQL clause"} (constantly false)] "anything")
          (is (= (count (:explainer @@#'mr/cache))
                 before-count)
              "MBQL clause pattern should be stable"))))

    (testing "Error function in schema metadata"
      (let [error-fn (fn [{:keys [value]} _] (str "Invalid value: " value))
            schema [:fn {:error/fn error-fn} number?]]
        (mr/explain schema "not-a-number")
        (let [before-count (count (:explainer @@#'mr/cache))]
          (mr/explain [:fn {:error/fn error-fn} number?] "not-a-number")
          (is (= (count (:explainer @@#'mr/cache))
                 before-count)
              "Error function pattern should be stable"))))

    #?(:clj
       (testing "Localized string validation (common in Metabase)"
         (testing "Function references in i18n context should be stable"
           ;; This simulates patterns like [:fn {:error/message "..."} i18n/localized-string?]
           (let [schema [:fn {:error/message "must be a string"} string?]]
             (mr/validate schema "hello")
             (let [before-count (count (:validator @@#'mr/cache))]
               (mr/validate [:fn {:error/message "must be a string"} string?] "hello")
               (is (= (count (:validator @@#'mr/cache))
                      before-count)
                   "i18n-style validation should be stable"))))))))

(deftest ^:parallel performance-characteristics-test
  (testing "Enhanced schema-cache-key performance is acceptable"
    (let [schemas [[:fn {:desc "num"} number?]
                   [:fn {:desc "str"} string?]
                   [:fn {:desc "pos"} (every-pred number? pos?)]
                   [:fn {:desc "blank"} (complement str/blank?)]
                   [:re #"\d+"]
                   [:and number? pos?]]
          iterations 100
          start-time (System/nanoTime)]

      ;; Generate cache keys many times
      (dotimes [_ iterations]
        (doseq [schema schemas]
          (mr/validate schema (case (first schema)
                                :fn 42
                                :re "123"
                                :and 42))))

      (let [elapsed-ms (/ (- (System/nanoTime) start-time) 1000000.0)]
        ;; Should complete reasonably quickly, I see 20ms here locally
        (is (< elapsed-ms 100)
            "Cache key generation should be fast")))))

(deftest ^:parallel evil-schemas-test
  (testing "Evil schemas reproduce themselves in the cache"
    (let [schema-gen (fn [] [:int {:evil (rand)}])
          iterations 100
          start-time (System/nanoTime)
          cache-size-before (count (:validator @@#'mr/cache))]

      ;; Generate cache keys many times
      (dotimes [_ iterations]
        (let [schema (schema-gen)]
          (mr/validate schema 42)))

      (let [cache-size-after (count (:validator @@#'mr/cache))]
        (is (> cache-size-after cache-size-before)
            "Cache size should increase with evil schemas")
        (is (= (- cache-size-after cache-size-before) iterations)))

      (let [elapsed-ms (/ (- (System/nanoTime) start-time) 1000000.0)]
        ;; Should complete reasonably quickly (less than 1 second for this test)
        (is (< elapsed-ms 100)
            "Cache key generation should be fast")))))

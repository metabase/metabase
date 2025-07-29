(ns metabase.util.malli.registry-test
  #?(:cljs (:require-macros
            [metabase.util.malli.registry-test :refer [stable-key?]]))
  (:require
   #?@(:clj ([metabase.util.i18n :as i18n :refer [deferred-tru]]))
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- clear-cache []
  (reset! @#'mr/cache {}))

(use-fixtures :each (fn [t] (clear-cache) (t)))

(let [cache-misses (atom [])]
  (binding [mr/*cache-miss-hook* (fn [k schema _value-thunk]
                                   (swap! cache-misses conj [k schema]))]
    (mr/validate [:fn (fn [x] (or (int? x) (string? x)))] "x")
    (mr/validate [:fn (fn [x] (or (int? x) (string? x)))] "x"))
  @cache-misses)

(def to-wrap? #{'partial
                'comp
                'complement
                'constantly
                'juxt
                'every-pred
                'some-fn
                'fnil
                'completing
                'comparator
                'fn
                'fn*})

;; (defmacro auto-wrap-schema [schema-form]
;;   `'~(walk/postwalk
;;       (fn [x]
;;         (if (and (list? x)
;;                  (to-wrap? (first x)))
;;           (list 'mr/with-key x)
;;           x))
;;       schema-form))

;; (auto-wrap-schema [:map [:x [:fn (constantly true)]]])

(defmacro with-returning-cache-misses [& body]
  `(let [cache-misses# (atom [])]
     (binding [mr/*cache-miss-hook* (fn [k# schema# _#]
                                      (swap! cache-misses# conj [k# schema#]))]
       ~@body)
     @cache-misses#))

(deftest mu-defn-with-cachable-schemas-does-not-grow-cache
  (is (= []
         (with-returning-cache-misses
           (mu/defn my-good-fn :- [:fn (mr/with-key (fn [_] true))]
             "A good function that should be stable in the cache."
             [_a :- [:fn (mr/with-key (fn [_]))]]
             true)))))

(defn- excise-fns [x]
  (walk/postwalk (fn [x] (if (fn? x) :function x)) x))

(deftest mu-defn-with-cachable-schemas-and-calling-it-does-not-grow-cache
  (is (= [[:explainer [:fn {:marker 1} :function]]]
         (excise-fns
          (with-returning-cache-misses
            (mu/defn my-good-fn :- (mr/with-key [:fn {:marker 1} (fn [_] true)])
              "A good function that should be stable in the cache."
              [_a :- (mr/with-key [:fn {:marker 1} (fn [_] true)])]
              true)
            ;; calling it once should not grow the cache:
            (my-good-fn 42)
            ;; redefining the function should not grow the cache:
            (mu/defn my-good-fn :- (mr/with-key [:fn {:marker 1} (fn [_] true)])
              "A good function that should be stable in the cache."
              [_a :- (mr/with-key [:fn {:marker 1} (fn [_] true)])]
              true)
            ;; calling it again should not grow the cache:
            (my-good-fn 42))))))

(deftest mu-defn-with-uncachable-schema-and-calling-it-creates-explainer
  (is (= [:explainer]
         (mapv first
               (with-returning-cache-misses
                 (mu/defn my-good-fn :- [:fn (fn [_] true)]
                   "A good function that should be stable in the cache."
                   [_a :- [:fn (fn [_] true)]]
                   true)
                 (my-good-fn 42))))))

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

(deftest ^:parallel cache-handles-inline-anonymous-fn-with-key-test
  (testing "Inline anonymous functions are not cachable!"
    (is (mr/stable-key? [:fn (mr/with-key (fn [s] (if (str/blank? s) false true)))]))
    (is (mr/stable-key? [:fn {:error/fn (mr/with-key (fn [_ _] "no!"))} number?]))
    (is (mr/stable-key? [:map [:x [:fn (mr/with-key (fn [_] false))]]]))))

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
    (is (= [:map
            [:parent {:optional true} [:ref ::location]]
            [:name :string]
            [:id [:int {:min 1}]]
            [:id-2 [:int {:description "another ID", :min 1}]]]
           (mc/form (mr/resolve-schema ::location))))
    (is (= [:map
            [:parent {:optional true} [:ref ::location]]
            [:name :string]
            [:id [:int {:min 1}]]
            [:id-2 [:int {:description "another ID", :min 1}]]]
           (mc/form (mr/resolve-schema [:ref ::location]))))))

(deftest ^:parallel cache-function-objects-stability-test
  (testing "Enhanced schema-cache-key function handles function objects to prevent memory leaks"
    (testing "Basic function references should be stable"
      (let [schema [:fn {:description "number check"} number?]]
        (is (= [:validator] (map first (with-returning-cache-misses (mr/validate schema 42)))))
        (is (= []
               (with-returning-cache-misses
                 (mr/validate [:fn {:description "number check"} number?] 42)
                 (mr/validate [:fn {:description "number check"} number?] 42)
                 (mr/validate [:fn {:description "number check"} number?] 42)))
            "Function schema reuse should not create multiple cache entries")
        (is (= [:validator]
               (map first (with-returning-cache-misses
                            (mr/validate [:fn number?] 42))))
            "New schemas create new a new cache entry")))

    (testing "Function composition should be stable (every-pred)"
      (let [schema [:fn {:error/message "positive number"} (every-pred number? pos?)]]
        (is (= [:validator] (map first (with-returning-cache-misses (mr/validate schema 42)))))
        (is (= []
               (with-returning-cache-misses
                 (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] 42)
                 (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] 42)
                 (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] 42)))
            "Function schema reuse should not create multiple cache entries")
        (is (= [:validator]
               (map first (with-returning-cache-misses
                            (mr/validate [:fn (every-pred number? pos?)] 42))))
            "New schemas create new a new cache entry")))

    (testing "Complement functions should be stable"
      (let [schema [:fn {:error/message "non-blank string"} (complement str/blank?)]]
        (is (= [:validator] (map first (with-returning-cache-misses (mr/validate schema "hello")))))
        (is (= []
               (with-returning-cache-misses
                 (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] "hello")
                 (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] "hello")
                 (mr/validate [:fn {:error/message "positive number"} (every-pred number? pos?)] "hello")))
            "Function schema reuse should not create multiple cache entries")
        (is (= [:validator]
               (map first (with-returning-cache-misses
                            (mr/validate [:fn {:i-am "a different schema"} (every-pred number? pos?)] "hello"))))
            "New schemas create new a new cache entry")))

    (testing "Constant functions should be stable"
      (let [schema [:fn (constantly false)]]
        (is (= [:validator] (map first (with-returning-cache-misses (mr/validate schema :anything)))))
        (is (= []
               (with-returning-cache-misses
                 (mr/validate [:fn (constantly false)] :anything)
                 (mr/validate [:fn (constantly false)] :anything)
                 (mr/validate [:fn (constantly false)] :anything)))
            "Function schema reuse should not create multiple cache entries")
        (is (= [:validator]
               (map first (with-returning-cache-misses
                            (mr/validate [:fn {:i-am "a different schema"} (constantly false)] :anything))))
            "New schemas create new a new cache entry")))

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

;; What if the stable key is made with constantly? how is that getting caught?
;; I am catching it in the schema key mechanism. It's illegal to use
;; `(constantly true)`, `(every-pred even?)`, `(complement str/blank?)` or similar things without
;; wrapping them in `mr/with-key`!! That's the only way we can ensure that the cache key is stable, AND
;; that the functions getting cached are the ones we expect.
;;
;; If we don't do it that way, then this will happen:
;; (mr/validate [:fn (constantly true)] 42) ;=> true
;; ^ caches the function `(constantly true)` with a cache key of [:fn #function[clojure.core/constantly_1234]]
;; now, when we calculate the cache key for a fn schema created with constantly again, the KEY WILL BE THE SAME:
;; (mr/validate [:fn (constantly false)] 42) ;=> true
;; ^ This schema should fail, but it willreturn true because the cache key is the same as the previous one, so
;; it will reuse the cached function `(constantly true)`!!!!

(defn rewrite-schema-with-key
  "Rewrites a schema with a stable key, ensuring that the cache key is consistent."
  [schema]
  (walk/postwalk
   (fn [x]
     (if (and (fn? x) (not= x (constantly true)))
       (mr/with-key x)
       x))
   schema))

(deftest partial-schemas-are-cached-correctly
  (is (#'mr/schema-cache-key [:fn (mr/with-key (every-pred even?))]))
  (is (true? (mr/validate [:fn (every-pred even?)] 42)))
  (is (false? (mr/validate [:fn (every-pred odd?)] 42))))

(deftest ^:parallel cache-memory-leak-prevention-test
  (testing "Memory leak prevention through stable cache keys"
    (testing "Multiple identical schemas with function composition don't grow cache unboundedly"
      ;; Add multiple identical schemas that would have created different cache keys before the fix
      (is (mr/stable-key? [:fn (every-pred number? pos?)]))
      (is (= 1 (count (with-returning-cache-misses
                        (dotimes [i 20]
                          (mr/validate [:fn {:error/message "positive"} (every-pred number? pos?)] (inc i)))))))

      ;; Should only have 1 validator in cache (plus any others from previous tests)
      (let [validator-cache (:validator @@#'mr/cache)
            our-validators (filter (fn [[k _]]
                                     (and (vector? k)
                                          (= (first k) :fn)
                                          (= (get-in k [1 :error/message]) "positive")))
                                   validator-cache)]
        (is (<= (count our-validators) 2)
            "Should have at most 1-2 cache entries for identical schemas, not 20")))))

(deftest ^:parallel schema-cache-key-backward-compatibility-test
  (testing "Enhanced schema-cache-key maintains backward compatibility"
    (testing "Regex patterns still work correctly (existing functionality)"
      (let [schema [:re #"\d{4}"]]
        (is (mr/stable-key? schema))
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
                   [:re {:desc "raw re"} #"\d+"]
                   [:or {:desc "deep re"} [:re #"\d+"]]
                   [:and number? pos?]]
          iterations 100
          start-time (System/nanoTime)]

      ;; Generate cache keys many times
      (dotimes [_ iterations]
        (doseq [schema schemas]
          (mr/validate schema (case (first schema)
                                :fn 42
                                :re "123"
                                :or "123"
                                :and 42))))

      (let [elapsed-ms (/ (- (System/nanoTime) start-time) 1000000.0)]
        ;; Should complete reasonably quickly, I see 3ms locally
        (is (< elapsed-ms 10)
            "Cache key generation should be fast")))))

(deftest ^:parallel evil-schemas-test
  (testing "Evil schemas reproduce themselves in the cache"
    (let [evil-schema-gen (fn [] [:int {:evil (rand)}])
          iterations 100]
      (is (= 100 (count
                  (with-returning-cache-misses
                    (dotimes [_ iterations]
                      (let [evil-schema (evil-schema-gen)]
                        (mr/validate evil-schema 42))))))))))

(deftest ^:parallel with-api-error-message-key-stability-test
  (is (mr/stable-key? (mu/with-api-error-message
                       [:and
                        {:error/message "non-blank string"
                         :json-schema   {:type "string" :minLength 1}}
                        [:string {:min 1}]
                        [:fn
                         {:error/message "non-blank string"}
                         (mr/with-key (complement str/blank?))]]
                       (deferred-tru "value must be a non-blank string.")))))

(ns metabase.util.malli.registry-test
  (:require
   #?@(:clj
       ([metabase.util.i18n :as i18n]))
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli.registry :as mr]))

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

(deftest ^:parallel with-key-stabilizes-cache-keys
  (are [input expected] (=
                         {:single-wrap true
                          :double-wrap true
                          :no-wrap true}
                         {:single-wrap (= expected (#'mr/schema-cache-key (mr/with-key input)))
                          ;; wrapping multiple times with `with-key` should not change the cache key
                          :double-wrap (= expected (#'mr/schema-cache-key (mr/with-key (mr/with-key input))))
                          ;; without wrapping with-key, these are not equal
                          :no-wrap (not= expected (#'mr/schema-cache-key input))})

    ;; higher order function
    (constantly true)
    "(constantly true)"

    ;; higher order function as a malli schema
    [:fn (constantly true)]
    "[:fn (constantly true)]"

    ;; Simple function literals
    #_:clj-kondo/ignore
    #(odd? %)
    "(fn* [a] (odd? a))"

    ;; Simple function literals as a malli schema
    #_:clj-kondo/ignore
    [:fn #(odd? %)]
    "[:fn (fn* [a] (odd? a))]"

    ;; Multiple arity function
    #_:clj-kondo/ignore
    #(+ %1 %2)
    "(fn* [a b] (+ a b))"

    ;; scoped error fn
    (let [error-fn (fn [{:keys [value]} _] (str "Not valid: " (pr-str value)))]
      [:fn {:error/fn error-fn} number?])
    (str/join ["(let [error-fn (fn [{:keys [value]} _] (str \"Not valid: \" (pr-str value)))] "
               "[:fn #:error{:fn error-fn} number?])"])

    ;; inline error fn
    [:fn {:error/fn (fn [{:keys [value]} _] (str "Not valid: " (pr-str value)))} number?]
    "[:fn #:error{:fn (fn [{:keys [value]} _] (str \"Not valid: \" (pr-str value)))} number?]"

    ;; Functions with nested calls
    #(-> % inc (* 2) str)
    "(fn* [a] (-> a inc (* 2) str))"

    ;; Functions with threading macros
    #(->> % (map inc) (filter even?))
    "(fn* [a] (->> a (map inc) (filter even?)))"

    ;; Function with multiple arguments
    #(even? (+ 1 %1 %2 %3))
    "(fn* [a b c] (even? (+ 1 a b c)))"

    ;; Function with insane arg count
    #(even? (+ 1 %1 %2 %3 %4 %5 %6 %7 %8 %9 %10
               %11 %12 %13 %14 %15 %16 %17 %18 %19 %20))
    (str/join ["(fn* [a b c d e f g h i j k l m n o p q r s t] "
               "(even? (+ 1 a b c d e f g h i j k l m n o p q r s t)))"])

    ;; Function with insane arg count and %&
    #(even? (+ 1 %1 %2 %3 %4 %5 %6 %7 %8 %9 %10
               %11 %12 %13 %14 %15 %16 %17 %18 %19 %20 %& %&))
    (str/join ["(fn* [a b c d e f g h i j k l m n o p q r s t & u] "
               "(even? (+ 1 a b c d e f g h i j k l m n o p q r s t u u)))"])

    ;; Function resuing args
    #(even? (+ 1 %1 %1 %1 %2 %2 %2 %3 %3 %3 %4 %4 %4 %5 %5 %5
               %6 %6 %6 %7 %7 %7 %8 %8 %8 %9 %9 %9 %10 %10 %10 %11 %11 %11 %12 %12 %12
               %13 %13 %13 %14 %14 %14 %15 %15 %15 %16 %16 %16 %17 %17 %17 %18 %18 %18
               %19 %19 %19 %20 %20 %20 %& %& %&))
    (str/join ["(fn* [a b c d e f g h i j k l m n o p q r s t & u] "
               "(even? (+ 1 a a a b b b c c c d d d e e e "
               "f f f g g g h h h i i i j j j k k k l l l "
               "m m m n n n o o o p p p q q q r r r s s s "
               "t t t u u u)))"])

    ;; Schema with metadata
    [:fn ^{:doc "checks if odd"} (fn [x] (even? (inc x)))]
    "[:fn (fn [x] (even? (inc x)))]"

    ;; Nested predicates
    [:fn (fn [x] ((some-fn string? keyword?) x))]
    "[:fn (fn [x] ((some-fn string? keyword?) x))]"

    ;; Complex predicate composition
    [:fn (fn [x] ((comp not zero? count) x))]
    "[:fn (fn [x] ((comp not zero? count) x))]"

    ;; Function with destructuring
    #(let [{:keys [a b]} %] (+ a b))
    "(fn* [a] (let [{:keys [a b]} a] (+ a b)))"

    ;; Function with multiple args and destructuring
    #(let [[x y] %1] (+ x y %2))
    "(fn* [a b] (let [[x y] a] (+ x y b)))"

    ;; Anonymous function with conditional
    #(if (pos? %) (inc %) (dec %))
    "(fn* [a] (if (pos? a) (inc a) (dec a)))"

    ;; Function with local bindings
    #(let [doubled (* 2 %)] (str doubled))
    "(fn* [a] (let [doubled (* 2 a)] (str doubled)))"

    ;; Quoted function
    ;; (we don't use these a lot, but they are valid, (and serializiable))
    [:fn '(fn [x] (even? x))]
    "[:fn (quote (fn [x] (even? x)))]"

    ;; Schema with custom key and complex function
    [:fn {:validator :custom}
     (fn [m] (and (map? m) (contains? m :id)))]
    "[:fn {:validator :custom} (fn [m] (and (map? m) (contains? m :id)))]"

    [:fn {:my-odd :fn} (fn [x] (even? (inc x)))]
    "[:fn {:my-odd :fn} (fn [x] (even? (inc x)))]"

    [:fn (fn [x] ((every-pred even? number? #(= 1 (count (str %)))) x))]
    "[:fn (fn [x] ((every-pred even? number? (fn* [a] (= 1 (count (str a))))) x))]"))

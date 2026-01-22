(ns metabase.util.malli.registry-test
  (:require
   #?@(:clj
       ([metabase.util.i18n :as i18n]))
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.registry-test-macro :refer [with-returning-cache-miss-count]]))

(deftest ^:parallel cache-handle-regexes-test
  (testing (str "For things that aren't ever equal when you re-evaluate them (like Regex literals) maybe sure we do"
                " something smart to avoid creating infinite cache entries")
    (let [unique-schema [:re {:id (rand)} #"\d{4}"]]
      ;; 2 misses as we cache both the Schema and validator.
      (is (= 2 (with-returning-cache-miss-count
                 (mr/validate unique-schema "1234"))))
      (is (= 0 (with-returning-cache-miss-count
                 (mr/validate unique-schema "1234")
                 (mr/validate unique-schema "1234")))
          "Calling validate with a previously cached schema does not miss cache"))))

(deftest ^:parallel cache-handle-composed-regexes-test
  (testing (str "For things that aren't ever equal when you re-evaluate them (like Regex literals) maybe sure we do"
                " something smart to avoid creating infinite cache entries")
    (let [unique-id (rand)]
      ;; 2 misses as we cache both the Schema and validator.
      (is (= 2 (with-returning-cache-miss-count
                 (mr/validate [:and {:id unique-id} :string [:re #"\d{4}"]] "1234"))))
      (let [validator-key-set (set (keys (:validator @@#'mr/cache)))]
        (is (contains? validator-key-set
                       (#'mr/schema-cache-key [:and {:id unique-id} :string [:re #"\d{4}"]])))
        (is (not (contains? validator-key-set
                            [:and {:id unique-id} :string [:re #"\d{4}"]]))))
      (is (= 0
             (with-returning-cache-miss-count
               (mr/validate [:and {:id unique-id} :string [:re #"\d{4}"]] "1234")
               (mr/validate [:and {:id unique-id} :string [:re #"\d{4}"]] "1234")))
          "Calling validate with a previously cached schema does not miss cache")
      (is (= 6
             (with-returning-cache-miss-count
               ;; one
               (mr/validate [:and {:id unique-id} [:re #"\d{1}"] :string] "1234")
               (mr/validate [:and {:id unique-id} [:re #"\d{1}"] :string] "1234")
               ;; two
               (mr/validate [:and {:id unique-id} [:re #"\d{2}"] :string] "1234")
               (mr/validate [:and {:id unique-id} [:re #"\d{2}"] :string] "1234")
               ;; three
               (mr/validate [:and {:id unique-id} [:re #"\d{3}"] :string] "1234")
               (mr/validate [:and {:id unique-id} [:re #"\d{3}"] :string] "1234")))
          "Calling validate multiple times with the 'same' schema does not miss cache"))))

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

(ns metabase.types-test
  (:require [metabase.types :as sut]
            #?(:clj [clojure.test :as t]
               :cljs [cljs.test :as t :include-macros true])))

(defn- keywords-in-namespace [keyword-namespace]
  (->> (var-get #'clojure.core/global-hierarchy)
       :parents
       keys
       (filter #(= (namespace %) (name keyword-namespace)))))

(defn- test-derived-from [a-type {:keys [required disallowed]}]
  (t/testing a-type
    (doseq [t required]
      (t/testing (str "should derive from " t)
        (t/is (isa? a-type t))))
    (doseq [t disallowed]
      (t/testing (str "should NOT derive from " t)
        (t/is (not (isa? a-type t)))))))

(defn- test-keywords-in-namespace-derived-from [keyword-namespace options]
  (doseq [t (keywords-in-namespace keyword-namespace)]
    (test-derived-from t options)))

(t/deftest data-types-test
  (test-keywords-in-namespace-derived-from
   "type"
   {:required   [:type/*]
    :disallowed [:Semantic/* :Coercion/* :Relation/* :entity/*]}))

(t/deftest semantic-types-test
  (test-keywords-in-namespace-derived-from
   "Semantic"
   {:required   [:Semantic/*]
    :disallowed [:Coercion/* :Relation/* :entity/*]}))

(t/deftest relation-types-test
  (test-keywords-in-namespace-derived-from
   "Relation"
   {:required   [:Relation/*]
    :disallowed [:type/* :Semantic/* :Coercion/* :entity/*]}))

(t/deftest coercion-strategies-test
  (test-keywords-in-namespace-derived-from
   "Coercion"
   {:required   [:Coercion/*]
    :disallowed [:type/* :Semantic/* :Relation/* :entity/*]}))

(t/deftest entity-types-test
  (test-keywords-in-namespace-derived-from
   "entity"
   {:required   [:entity/*]
    :disallowed [:type/* :Semantic/* :Relation/* :Coercion/*]}))

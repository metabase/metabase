(ns metabase.search.query-semantics
  "Search fixtures shared by the app-db and semantic test suites."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]))

(def cases
  "Ordered, isolated search scenarios with their translated comparisons."
  (-> "search/query_semantics.edn" io/resource slurp edn/read-string))

(defn expected-hits
  "Expected result labels for an engine's identical-query search.

  For semantic this is the vector arm alone; see [[expected-hybrid-hits]] for what search returns."
  [case engine]
  (set (if (= engine :semantic)
         (get-in case [:expect :semantic :vector])
         (get-in case [:expect engine]))))

(defn expected-hybrid-hits
  "Expected semantic search results: the union of its keyword and vector arms."
  [case]
  (set/union (set (get-in case [:expect :semantic :keyword]))
             (set (get-in case [:expect :semantic :vector]))))

(defn comparison-spec
  "Return an engine's paired query and hits, inheriting the scenario pair unless overridden."
  [case comparison engine]
  (let [spec (get-in comparison [:alternatives engine]
                     {:query (:query case), :hits (expected-hits case engine)})]
    (update spec :hits set)))

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
  "Expected result labels for an engine's identical-query search."
  [case engine]
  (if (= engine :semantic)
    (set/union (set (get-in case [:expect :semantic :keyword]))
               (set (get-in case [:expect :semantic :vector])))
    (set (get-in case [:expect engine]))))

(defn comparison-spec
  "Return an engine's paired query and hits, inheriting the scenario pair unless overridden."
  [case comparison engine]
  (let [spec (get-in comparison [:alternatives engine]
                     {:query (:query case), :hits (expected-hits case engine)})]
    (update spec :hits set)))

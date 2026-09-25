(ns metabase.search.query-semantics
  "Per-scenario search fixtures shared by the app-db and semantic test suites."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]))

(defn- read-resource
  [path]
  (-> path io/resource slurp edn/read-string))

(def cases
  "Search scenarios in the order recorded by the resource manifest."
  (mapv (fn [id]
          (read-resource (str "search/query_semantics/" id ".edn")))
        (read-resource "search/query_semantics/manifest.edn")))

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

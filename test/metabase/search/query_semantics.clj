(ns metabase.search.query-semantics
  "Search fixtures shared by the app-db and semantic test suites."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]))

(def cases
  "The shared search scenarios, in fixture order, with their adapted-query comparisons."
  (-> "search/query_semantics.edn" io/resource slurp edn/read-string))

(defn- with-fallback
  "Semantic search's results: its keyword and vector arms, topped up with the fallback engine's hits."
  [keyword-hits vector-hits fallback-hits]
  ;; Semantic search falls back below its results threshold, which these catalogues always are, but only when
  ;; its own arms found something.
  (let [own (set/union (set keyword-hits) (set vector-hits))]
    (if (seq own)
      (set/union own (set fallback-hits))
      #{})))

(defn expected-hits
  "Expected result labels for an engine's identical-query search.
  The `:semantic-only` engine is the vector arm alone; see [[expected-hybrid-hits]] for both arms.
  The `:semantic-with-fallback` engine adds the keyword arm and app-db's PostgreSQL hits, as semantic search does."
  [case engine]
  (condp = engine
    :semantic-only          (set (get-in case [:expect :semantic :vector]))
    :semantic-with-fallback (with-fallback (get-in case [:expect :semantic :keyword])
                              (get-in case [:expect :semantic :vector])
                              (get-in case [:expect :appdb-postgres]))
    (set (get-in case [:expect engine]))))

(defn expected-hybrid-hits
  "Expected union of the semantic keyword and vector arms."
  [case]
  (set/union (set (get-in case [:expect :semantic :keyword]))
             (set (get-in case [:expect :semantic :vector]))))

(defn comparison-spec
  "An engine's query and expected hits for `comparison`.
  Engines without an alternative keep the scenario's query and hits.
  Both semantic engines share the `:semantic` alternative, whose `:hits` are the vector arm."
  [case comparison engine]
  (let [semantic (get-in comparison [:alternatives :semantic])
        spec     (condp = engine
                   :semantic-only          semantic
                   :semantic-with-fallback (when semantic
                                             {:query (:query semantic)
                                              :hits  (with-fallback (:keyword semantic)
                                                       (:hits semantic)
                                                       (:fallback semantic))})
                   (get-in comparison [:alternatives engine]))]
    (update (or spec {:query (:query case), :hits (expected-hits case engine)}) :hits set)))

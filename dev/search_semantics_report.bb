#!/usr/bin/env bb

(ns dev.search-semantics-report
  "Generate a standalone HTML comparison of the search semantics fixture.
  Run with ./bin/mage search-semantics-report, optionally followed by an output path.
  Direct invocation: bb -cp test:test_resources dev/search_semantics_report.bb."
  (:require
   [babashka.process :as p]
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-report :as report]))

(set! *warn-on-reflection* true)

(defn- provenance []
  {:commit    (str/trim (:out (p/shell {:out :string} "git" "rev-parse" "--short" "HEAD")))
   :dirty     (not (str/blank? (:out (p/shell {:out :string} "git" "status" "--porcelain" "--"
                                              "test" "test_resources" "dev"))))
   :generated (str (java.time.LocalDate/now))})

(let [output (or (first *command-line-args*) "target/search-semantics-report/index.html")
      frozen (-> "search/arctic_embed_l_v2_vectors.edn" io/resource slurp edn/read-string)
      html   (slurp "dev/resources/dev/search_semantics_report.html")
      data   (report/report-data fixtures/cases frozen (provenance))
      page   (report/render html (json/generate-string data))]
  (io/make-parents output)
  (spit output page)
  (println "Wrote" (.getCanonicalPath (io/file output))))

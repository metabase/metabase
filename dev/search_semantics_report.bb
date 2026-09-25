#!/usr/bin/env bb

(ns search-semantics-report
  "Generate a disposable, self-contained browser view of the search fixture.

  Run from the repository root with:
  bb -cp test:test_resources dev/search_semantics_report.bb

  Pass an output path to write somewhere other than target/search-semantics-report/index.html."
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-stats :as stats]))

(defn- labels
  [hits]
  (mapv name (sort hits)))

(defn- document-data
  [docs]
  (mapv (fn [[label attributes]]
          {:label (name label), :attributes attributes})
        (sort-by key docs)))

(defn- engine-data
  [row corpus engine]
  (let [spec (when (= corpus :translations) (get-in row [:specs engine]))]
    (cond-> {:id   (name engine)
             :hits (labels (get-in row [:results engine]))}
      spec (assoc :query (:query spec))
      (and (= corpus :same-query) (= engine :semantic))
      (assoc :keyword-hits (labels (get-in row [:semantic-arms :keyword]))
             :vector-hits  (labels (get-in row [:semantic-arms :vector]))))))

(defn- row-data
  [corpus row]
  (cond-> {:id        (if (= corpus :same-query)
                        (:id row)
                        (str (:scenario-id row) " / " (:focus row)))
           :scenario  (if (= corpus :same-query) (:id row) (:scenario-id row))
           :focus     (:focus row)
           :config    (:config row)
           :query     (:query row)
           :docs      (document-data (:docs row))
           :engines   (mapv (partial engine-data row corpus) stats/engines)
           :allEqual  (apply = (map (fn [engine] (get-in row [:results engine])) stats/engines))}
    (= corpus :translations)
    (assoc :target (name (:target row))
           :gold   (labels (:gold row)))))

(defn- pair-data
  [summary]
  (mapv (fn [[left right :as pair]]
          {:left   (name left)
           :right  (name right)
           :counts (get-in summary [:pairwise pair])})
        stats/engine-pairs))

(defn- summary-data
  [summary]
  (cond-> {:count     (:count summary)
           :allEqual  (:all-equal summary)
           :meanHits  (update-vals (:mean-hits summary) double)
           :pairs     (pair-data summary)}
    (:scores summary)
    (assoc :targets (:target-counts summary)
           :scores  (update-vals (:scores summary)
                                 (fn [values]
                                   (update-vals values #(if (number? %) (double %) %)))))))

(defn- report-data
  []
  (let [summary (stats/summary fixtures/cases)]
    {:engines      (mapv name stats/engines)
     :sameQuery    {:summary (summary-data (:same-query summary))
                    :cases   (mapv (partial row-data :same-query)
                                   (stats/scenario-rows fixtures/cases))}
     :translations {:summary (summary-data (:translations summary))
                    :cases   (mapv (partial row-data :translations)
                                   (stats/translation-rows fixtures/cases))}}))

(let [output (or (first *command-line-args*) "target/search-semantics-report/index.html")
      html   (slurp "dev/resources/dev/search_semantics_report.html")
      data   (-> (report-data) json/generate-string (str/replace "</" "<\\/"))
      page   (str/replace html "__REPORT_DATA__" data)]
  (when (= html page)
    (throw (ex-info "Report template has no data placeholder" {})))
  (io/make-parents output)
  (spit output page)
  (println "Wrote" (.getCanonicalPath (io/file output))))

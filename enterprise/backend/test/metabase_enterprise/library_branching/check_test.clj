(ns metabase-enterprise.library-branching.check-test
  "Tests of the checker that need the JVM: the writer, git and the mutation harness. The tests that also run in
  babashka are in `check-golden-test`."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.check-golden-test :as check-golden-test]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.golden :as golden]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.test-util :as lb.tu])
  (:import
   (org.eclipse.jgit.api Git MergeResult$MergeStatus)
   (org.eclipse.jgit.lib PersonIdent)))

(set! *warn-on-reflection* true)

(def ^:private library-tree
  "A tree of the Library with its three sections and a collection in its Dashboards section."
  (writer/encode-tree kinds/codecs
                      {"librarylibrarylibrary" {:kind :collection :name "Library" :place nil :refs #{}
                                                :attrs {:type "library"}}
                       "librarylibrarydatadat" {:kind :collection :name "Data" :place "librarylibrarylibrary"
                                                :refs #{} :attrs {:type "library-data"}}
                       "librarylibrarymetrics" {:kind :collection :name "Metrics" :place "librarylibrarylibrary"
                                                :refs #{} :attrs {:type "library-metrics"}}
                       "librarylibrarydashbrd" {:kind :collection :name "Dashboards" :place "librarylibrarylibrary"
                                                :refs #{} :attrs {:type "library-dashboards"}}
                       "TeamDashboardsColl001" {:kind :collection :name "Team" :place "librarylibrarydashbrd"
                                                :refs #{} :attrs {:type "library-dashboards"}}}))

(deftest repository-that-predates-a-section-is-green-test
  (testing "a tree of the Library that lacks the Dashboards section reads as one that holds it: the collection in
           the section has its place, and the section gets no lint"
    (let [r (check/check (dissoc library-tree "library/dashboards/_collection.yaml") {})]
      (is (contains? library-tree "library/dashboards/_collection.yaml"))
      (is (= {:green? true :findings [] :lints []} (select-keys r [:green? :findings :lints])))
      (is (= (:snapshot (check/check library-tree {})) (:snapshot r))))))

;;; ------------------------------------------------ A text merge in git ----------------------------------------------

(def ^:private ident (PersonIdent. "Test" "test@example.com"))

(defn- commit!
  [^Git git message]
  (-> git .add (.addFilepattern ".") .call)
  (-> git .add (.setUpdate true) (.addFilepattern ".") .call)
  (-> git .commit (.setMessage message) (.setAuthor ident) (.setCommitter ident) (.setSign false) .call))

(deftest text-merge-breaks-a-reference-test
  ;; Ours adds a metric that uses Total Revenue; theirs removes Total Revenue, which nothing used (the base has no
  ;; dashboard that shows it). Each branch is green, and git merges them as text with no conflict, because they change
  ;; different files. The merge is red.
  (let [dir (fs/file (fs/create-temp-dir {:prefix "library-branching-check-"}))]
    (try
      (with-open [git (-> (Git/init) (.setDirectory dir) (.setInitialBranch "main") .call)]
        (let [by-month (get (golden/tree) golden/by-month-path)
              run-dir  (fn [] (check/check (check/tree-files dir) {:manifest (golden/manifest-bytes)}))]
          (golden/write-tree! dir (dissoc (golden/tree) golden/by-month-path golden/overview-path))
          (commit! git "base")
          (is (:green? (run-dir)) "the base is green")
          (-> git .branchCreate (.setName "theirs") .call)
          (golden/write-tree! dir {golden/by-month-path by-month})
          (commit! git "ours: a metric that uses Total Revenue")
          (is (:green? (run-dir)) "ours is green")
          (-> git .checkout (.setName "theirs") .call)
          (io/delete-file (io/file dir golden/total-revenue-path))
          (commit! git "theirs: remove Total Revenue")
          (is (:green? (run-dir)) "theirs is green")
          (-> git .checkout (.setName "main") .call)
          (let [merge (-> git .merge (.include (.resolve (.getRepository git) "theirs")) (.setCommit false) .call)]
            (is (= MergeResult$MergeStatus/MERGED_NOT_COMMITTED (.getMergeStatus merge)) "git merges the text")
            (let [r (run-dir)]
              (is (= {:green? false
                      :findings [{:level :structural :rule :refs-closed :id golden/by-month-id
                                  :ref [:metric golden/total-revenue-id] :path golden/by-month-path}]}
                     (select-keys r [:green? :findings])))
              (testing "the report names the pair: the metric that uses, and the metric that is gone"
                (is (str/includes? (first (check/report r)) golden/by-month-id))
                (is (str/includes? (first (check/report r)) golden/total-revenue-id)))))))
      (finally (fs/delete-tree dir)))))

;;; ------------------------------------------------------ Laws -------------------------------------------------------

(defn- manifest-of
  "A manifest document whose environment holds every environment target of snapshot `s`."
  [s]
  (let [ks     (distinct (for [[_ {:keys [refs]}] s
                               [_ target]         refs
                               :when              (lb.tu/env-target? target)]
                           (second target)))
        tables (distinct (concat (filter #(= 3 (count %)) ks) (map #(subvec % 0 3) (filter #(< 3 (count %)) ks))))
        fields (fn fields [prefix]
                 (let [n     (count prefix)
                       below (filter #(and (< n (count %)) (= prefix (subvec % 0 n))) ks)]
                   (vec (for [f (sort (distinct (map #(nth % n) below)))
                              :let [nested (fields (conj prefix f))]]
                          (cond-> {:name f} (seq nested) (assoc :fields nested))))))]
    {:format    manifest/version
     :databases (vec (for [db (sort (distinct (concat (map first ks) (map first tables))))]
                       {:name   db
                        :tables (vec (for [[_ schema table :as t] (sort-by str (filter #(= db (first %)) tables))]
                                       (cond-> {:name table :fields (fields t)}
                                         schema (assoc :schema schema))))}))}))

(defspec check-is-decode-then-validate-test 100
  ;; For every snapshot that the codecs can write, the check of its tree finds exactly the structural findings of
  ;; validate, with the fixed roots; with a manifest of its environment references, no semantic finding.
  (prop/for-all [s (kinds.tu/snapshot-gen 15)]
    (let [t        (writer/encode-tree kinds/codecs s)
          r        (check/check t {:manifest (writer/write-yaml (manifest-of s))})
          expected (validate/validate s {:roots (roots/root-ids s)})]
      (and (= (map #(dissoc % :level :path) (:findings r)) expected)
           (every? #(= :structural (:level %)) (:findings r))
           (= (empty? expected) (:green? r))
           (= [] (:lints r))))))

;;; ---------------------------------------------------- Mutations ----------------------------------------------------

(def ^:private mutations
  [{:name   :roots-unchecked
    :doc    "The check runs validate with no roots, so a metric at the root level passes CI."
    :target `check/check
    :edits  [[:replace '{:roots (roots/root-ids s)} {}]]}
   {:name   :semantic-skipped
    :doc    "The check never runs the semantic level, so a reference to a missing table passes CI."
    :target `check/check
    :edits  [[:replace '(semantic-check s env) []]]}
   {:name   :green-ignores-findings
    :doc    "A tree with findings is green."
    :target `check/check
    :edits  [[:replace '(empty? findings) true]]}])

(deftest check-mutations-test
  (mut/check mutations {:tests [#'check-golden-test/structural-findings-test
                                #'check-golden-test/semantic-findings-test
                                #'check-golden-test/decode-findings-test]}))

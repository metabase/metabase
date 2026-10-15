(ns metabase-enterprise.library-branching.check-test
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.check-test/with-temp-dir clojure.core/fn}}}
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.format.manifest-test :as manifest-test]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.test-util :as lb.tu])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git MergeResult$MergeStatus)
   (org.eclipse.jgit.lib PersonIdent)))

(set! *warn-on-reflection* true)

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- text ^String [^bytes b] (String. b "UTF-8"))

(def ^:private golden-dir "enterprise/backend/test_resources/library_branching/golden")

(defn- golden
  "`{path bytes}` of the golden repository."
  []
  (check/tree-files golden-dir))

(defn- golden-with
  "The golden tree with the files `changes`, `{path text-or-nil}`: a text replaces or adds the file, nil removes it."
  [changes]
  (reduce-kv (fn [t p s] (if (nil? s) (dissoc t p) (assoc t p (utf-8 s)))) (golden) changes))

(defn- edit
  "The golden tree with the text of the file `path` changed by `f`."
  [path f]
  (golden-with {path (f (text (get (golden) path)))}))

(def ^:private golden-manifest (manifest-test/golden-bytes))

(defn- checked
  "The check of tree `t` with the manifest `m` (bytes or text; default the golden manifest)."
  ([t] (checked t golden-manifest))
  ([t m] (check/check t {:manifest (if (string? m) (utf-8 m) m)})))

(defn- shape
  "The finding without its reason text."
  [finding]
  (dissoc finding :reason))

(def ^:private library-id "LiBrArYcOlLeCtIoN0001")
(def ^:private metrics-id "mEtRiCsCoLlEcTiOnId00")
(def ^:private revenue-id "cOlQuErIeS0ExAmPlE2x1")
(def ^:private total-revenue-id "IW8kbqZVaMxdGtCM2F4U6")
(def ^:private by-month-id "Qx81tWm0aLpN2ZcB7yYgr")
(def ^:private base-filter-id "bAsEfIlTeRsNiPpEt0001")
(def ^:private active-filter-id "aCtIvEpRoDuCtFiLtEr01")

(def ^:private total-revenue-path "library/metrics/revenue/total_revenue.metric.yaml")
(def ^:private by-month-path "library/metrics/revenue/total_revenue~Qx81tWm0aLpN2ZcB7yYgr.metric.yaml")
(def ^:private base-filter-path "snippets/base_filter.snippet.yaml")
(def ^:private active-filter-path "snippets/filters/active_product_filter.snippet.yaml")

;;; ------------------------------------------------------ Files ------------------------------------------------------

(defn- temp-dir ^File []
  (.toFile (Files/createTempDirectory "library-branching-check-" (make-array FileAttribute 0))))

(defn- write-tree!
  "Writes the tree `t`, `{path bytes-or-text}`, under directory `dir`."
  [^File dir t]
  (doseq [[p content] t]
    (let [f (io/file dir p)]
      (io/make-parents f)
      (if (string? content) (spit f content) (Files/write (.toPath f) ^bytes content (make-array java.nio.file.OpenOption 0))))))

(defmacro ^:private with-temp-dir
  [[binding] & body]
  `(let [~binding (temp-dir)]
     (try ~@body (finally (FileUtils/deleteDirectory ~binding)))))

(deftest tree-files-test
  (testing "the YAML files outside directories that start with a dot, and the format version file"
    (with-temp-dir [dir]
      (write-tree! dir (assoc (golden)
                              "README.md"                       "# Library\n"
                              ".github/workflows/check.yaml"    "on: pull_request\n"
                              ".git/config.yaml"                "x: 1\n"
                              ".metabase/manifest.yaml"         "format: x\n"
                              "library/.hidden/x.metric.yaml"   "kind: metric\n"
                              "library/notes.yml"               "x: 1\n"))
      (is (= (set (keys (golden))) (set (keys (check/tree-files dir)))))
      (is (= (map seq (vals (into (sorted-map) (golden))))
             (map seq (vals (into (sorted-map) (check/tree-files dir)))))))))

;;; ------------------------------------------------- Golden repositories ---------------------------------------------

(deftest green-test
  (testing "the golden repository with its manifest is green, with no lint"
    (is (= {:green? true :findings [] :lints [] :semantic? true} (checked (golden)))))
  (testing "without a manifest, the structural check alone runs"
    (is (= {:green? true :findings [] :lints [] :semantic? false} (check/check (golden) {})))))

(deftest decode-findings-test
  (testing "each kind of file that does not decode is red, with the path of the file"
    (are [changes expected] (= {:green? false :findings expected}
                               (-> (checked (golden-with changes))
                                   (select-keys [:green? :findings])
                                   (update :findings (partial mapv shape))))
      {"library/notes.yaml" "a: ["}
      [{:level :decode :type :unreadable :path "library/notes.yaml"}]

      {"library/overview.dashboard.yaml" "kind: dashboard\nid: 7RZUq1g5o1C5ws_e3ppKf\nname: Overview\n"}
      [{:level :decode :type :unknown-kind :kind :dashboard :path "library/overview.dashboard.yaml"}]

      {total-revenue-path "kind: metric\nid: IW8kbqZVaMxdGtCM2F4U6\nname: Total Revenue\n"}
      [{:level :decode :type :invalid :path total-revenue-path}]

      {"library/copy.metric.yaml" (text (get (golden) total-revenue-path))}
      [{:level :decode :type :duplicate-identity :id total-revenue-id
        :paths ["library/copy.metric.yaml" total-revenue-path]}]

      {".metabase/format.yaml" nil}
      [{:level :decode :type :no-format}]

      {".metabase/format.yaml" "format: library-branching/2\n"}
      [{:level :decode :type :unknown-format :format "library-branching/2" :path ".metabase/format.yaml"}]

      {"library/format.yaml" "format: library-branching/1\n"}
      [{:level :decode :type :duplicate-format :paths [".metabase/format.yaml" "library/format.yaml"]}])))

(deftest structural-findings-test
  (testing "each structural rule: red, with the item and the path of its file"
    (are [t expected] (= {:green? false :findings expected} (select-keys (checked t) [:green? :findings]))
      ;; an orphan: the parent of the Revenue collection is gone
      (golden-with {"library/metrics/_collection.yaml" nil})
      [{:level :structural :rule :place-inside :id revenue-id :place metrics-id
        :path "library/metrics/revenue/_collection.yaml"}]

      ;; a containment cycle: the Library moves into one of its own subcollections
      (edit "library/_collection.yaml" #(str % "parent: cOlQuErIeS0ExAmPlE2x1\n"))
      [{:level :structural :rule :acyclic :ids #{library-id metrics-id revenue-id}}]

      ;; a snippet inside a metric
      (edit base-filter-path #(str % "collection: IW8kbqZVaMxdGtCM2F4U6\n"))
      [{:level :structural :rule :kind-fits :id base-filter-id :place total-revenue-id :path base-filter-path}]

      ;; a dangling reference: a snippet uses a snippet that is gone
      (golden-with {base-filter-path nil})
      [{:level :structural :rule :refs-closed :id active-filter-id :ref [:snippet base-filter-id]
        :path active-filter-path}]

      ;; a metric at the root level, which is not a fixed root
      (edit total-revenue-path #(str/replace % "collection: cOlQuErIeS0ExAmPlE2x1\n" ""))
      [{:level :structural :rule :root :id total-revenue-id :path total-revenue-path}])))

(deftest semantic-findings-test
  (testing "a reference to a table that the manifest does not have is red; the report names the table"
    (let [no-products (writer/write-yaml
                       (update-in (codec/read-yaml golden-manifest) [:databases 0 :tables]
                                  (partial filterv #(not= "PRODUCTS" (:name %)))))
          r           (checked (golden) no-products)]
      (is (not (str/includes? (text no-products) "PRODUCTS")))
      (is (= {:green? false :semantic? true
              :findings [{:level :semantic :rule :env-resolves :id by-month-id :path by-month-path
                          :ref [:field [:env ["Sample Database" "PUBLIC" "PRODUCTS" "ID"]]]}
                         {:level :semantic :rule :env-resolves :id by-month-id :path by-month-path
                          :ref [:source-table [:env ["Sample Database" "PUBLIC" "PRODUCTS"]]]}]}
             (select-keys r [:green? :semantic? :findings])))
      (is (some #(and (str/includes? % by-month-id) (str/includes? % "Sample Database.PUBLIC.PRODUCTS")) (check/report r)))))
  (testing "a manifest that does not decode is red"
    (is (= [{:level :manifest :type :manifest-unreadable}]
           (mapv #(select-keys % [:level :type]) (:findings (checked (golden) "databases: ["))))))
  (testing "a tree that does not decode gets no semantic check"
    (is (= [:decode] (distinct (map :level (:findings (checked (golden-with {".metabase/format.yaml" nil})))))))))

(deftest lint-test
  (testing "a file at a path that is not its canonical path is green, with a lint"
    (let [moved (-> (golden)
                    (dissoc total-revenue-path)
                    (assoc "library/elsewhere.yaml" (get (golden) total-revenue-path)))]
      (is (= {:green? true :findings []
              :lints [{:rule :canonical-path :id total-revenue-id :path "library/elsewhere.yaml"
                       :canonical total-revenue-path}]}
             (select-keys (checked moved) [:green? :findings :lints]))))))

;;; ------------------------------------------------------ Report -----------------------------------------------------

(deftest report-test
  (testing "a green tree: one line"
    (is (= ["green"] (check/report (checked (golden))))))
  (testing "a dangling reference names both items, and the file of the user"
    (let [lines (check/report (checked (golden-with {base-filter-path nil})))]
      (is (= 2 (count lines)))
      (is (str/includes? (first lines) active-filter-path))
      (is (str/includes? (first lines) "Active product filter"))
      (is (str/includes? (first lines) active-filter-id))
      (is (str/includes? (first lines) base-filter-id))
      (is (= "red: 1 finding" (peek lines)))))
  (testing "a kind that cannot be in its container names the item and the container"
    (let [[line] (check/report (checked (edit base-filter-path #(str % "collection: IW8kbqZVaMxdGtCM2F4U6\n"))))]
      (is (str/includes? line "Base filter"))
      (is (str/includes? line "Total Revenue"))))
  (testing "a decode finding names its file"
    (is (str/includes? (first (check/report (checked (golden-with {"library/notes.yaml" "a: ["}))))
                       "library/notes.yaml")))
  (testing "a lint names the file and its canonical path, and the tree stays green"
    (let [moved (-> (golden) (dissoc base-filter-path) (assoc "x.yaml" (get (golden) base-filter-path)))
          lines (check/report (checked moved))]
      (is (str/includes? (first lines) "x.yaml"))
      (is (str/includes? (first lines) base-filter-path))
      (is (= "green" (peek lines))))))

;;; ------------------------------------------------ A text merge in git ----------------------------------------------

(def ^:private ident (PersonIdent. "Test" "test@example.com"))

(defn- commit!
  [^Git git message]
  (-> git .add (.addFilepattern ".") .call)
  (-> git .add (.setUpdate true) (.addFilepattern ".") .call)
  (-> git .commit (.setMessage message) (.setAuthor ident) (.setCommitter ident) (.setSign false) .call))

(deftest text-merge-breaks-a-reference-test
  ;; Ours adds a metric that uses Total Revenue; theirs removes Total Revenue, which nothing used. Each branch is
  ;; green, and git merges them as text with no conflict, because they change different files. The merge is red.
  (with-temp-dir [dir]
    (with-open [git (-> (Git/init) (.setDirectory dir) (.setInitialBranch "main") .call)]
      (let [by-month (get (golden) by-month-path)
            run-dir  (fn [] (check/check (check/tree-files dir) {:manifest golden-manifest}))]
        (write-tree! dir (dissoc (golden) by-month-path))
        (commit! git "base")
        (is (:green? (run-dir)) "the base is green")
        (-> git .branchCreate (.setName "theirs") .call)
        (write-tree! dir {by-month-path by-month})
        (commit! git "ours: a metric that uses Total Revenue")
        (is (:green? (run-dir)) "ours is green")
        (-> git .checkout (.setName "theirs") .call)
        (io/delete-file (io/file dir total-revenue-path))
        (commit! git "theirs: remove Total Revenue")
        (is (:green? (run-dir)) "theirs is green")
        (-> git .checkout (.setName "main") .call)
        (let [merge (-> git .merge (.include (.resolve (.getRepository git) "theirs")) (.setCommit false) .call)]
          (is (= MergeResult$MergeStatus/MERGED_NOT_COMMITTED (.getMergeStatus merge)) "git merges the text")
          (let [r (run-dir)]
            (is (= {:green? false
                    :findings [{:level :structural :rule :refs-closed :id by-month-id
                                :ref [:metric total-revenue-id] :path by-month-path}]}
                   (select-keys r [:green? :findings])))
            (testing "the report names the pair: the metric that uses, and the metric that is gone"
              (is (str/includes? (first (check/report r)) by-month-id))
              (is (str/includes? (first (check/report r)) total-revenue-id)))))))))

;;; ------------------------------------------------------- Run -------------------------------------------------------

(deftest run-checkout-test
  (with-temp-dir [dir]
    (write-tree! dir (assoc (golden) manifest/path golden-manifest))
    (testing "a green checkout exits 0, and the manifest in the checkout is the default"
      (let [out (with-out-str (is (= 0 (check/run (str dir) nil))))]
        (is (= "green\n" out))))
    (testing "a manifest at another path"
      (let [other (io/file dir "other.yaml")]
        (spit other "format: library-branching-manifest/1\ndatabases: []\n")
        (let [out (with-out-str (is (= 1 (check/run (str dir) (str other)))))
              n   (count (:findings (checked (golden) (slurp other))))]
          (is (< 1 n))
          (is (str/ends-with? out (str "red: " n " findings\n"))))))
    (testing "a red checkout exits 1"
      (io/delete-file (io/file dir base-filter-path))
      (let [out (with-out-str (is (= 1 (check/run (str dir) nil))))]
        (is (str/includes? out active-filter-id))))))

(deftest parse-args-test
  (is (= {:dir "repo" :manifest nil} (check/parse-args ["repo"])))
  (is (= {:dir "repo" :manifest "m.yaml"} (check/parse-args ["repo" "--manifest" "m.yaml"])))
  (is (nil? (check/parse-args [])))
  (is (nil? (check/parse-args ["repo" "--manifest"])))
  (is (nil? (check/parse-args ["repo" "extra"]))))

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
    :edits  [[:replace '(semantic/validate s env) []]]}
   {:name   :green-ignores-findings
    :doc    "A tree with findings is green."
    :target `check/check
    :edits  [[:replace '(empty? findings) true]]}])

(deftest check-mutations-test
  (mut/check mutations {:tests [#'structural-findings-test #'semantic-findings-test #'decode-findings-test]}))

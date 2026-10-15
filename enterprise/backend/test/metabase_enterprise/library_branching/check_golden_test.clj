(ns metabase-enterprise.library-branching.check-golden-test
  "Tests of the checker on the golden repository and its variants. They run on the JVM and in babashka, so each
  namespace that they require must load in babashka."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.golden :as golden]))

(set! *warn-on-reflection* true)

(def ^:private golden-manifest (golden/manifest-bytes))

(defn- checked
  "The check of tree `t` with the manifest `m` (bytes or text; default the golden manifest)."
  ([t] (checked t golden-manifest))
  ([t m] (check/check t {:manifest (if (string? m) (golden/utf-8 m) m)})))

(defn- shape
  "The finding without its reason text."
  [finding]
  (dissoc finding :reason))

(defn- with-temp-dir
  "Calls `f` with a new empty directory, and deletes the directory after."
  [f]
  (let [dir (fs/file (fs/create-temp-dir {:prefix "library-branching-check-"}))]
    (try (f dir) (finally (fs/delete-tree dir)))))

;;; ------------------------------------------------------ Files ------------------------------------------------------

(deftest tree-files-test
  (testing "every file of the checkout, with its relative path, except the files of the git directory"
    (with-temp-dir
      (fn [dir]
        (let [others {"README.md"                     "# Library\n"
                      ".github/workflows/check.yaml"  "on: pull_request\n"
                      ".metabase/manifest.yaml"       "format: x\n"
                      "library/.hidden/x.metric.yaml" "kind: metric\n"
                      "library/notes.yml"             "x: 1\n"}]
          (golden/write-tree! dir (assoc (merge (golden/tree) others)
                                         ".git/config"          "[core]\n"
                                         "library/.git/HEAD"    "ref: refs/heads/main\n"))
          (is (= (into (set (keys (golden/tree))) (keys others)) (set (keys (check/tree-files dir)))))
          (let [files (check/tree-files dir)]
            (is (= (map seq (vals (into (sorted-map) (golden/tree))))
                   (map #(seq (get files %)) (sort (keys (golden/tree))))))))))))

;;; ------------------------------------------------- Golden repositories ---------------------------------------------

(deftest green-test
  (testing "the golden repository with its manifest is green, with no lint"
    (is (= {:green? true :findings [] :lints [] :semantic? true}
           (select-keys (checked (golden/tree)) [:green? :findings :lints :semantic?]))))
  (testing "without a manifest, the structural check alone runs"
    (is (= {:green? true :findings [] :lints [] :semantic? false}
           (select-keys (check/check (golden/tree) {}) [:green? :findings :lints :semantic?])))))

(deftest decode-findings-test
  (testing "each kind of file that does not decode is red, with the path of the file"
    (are [changes expected] (= {:green? false :findings expected}
                               (-> (checked (golden/tree-with changes))
                                   (select-keys [:green? :findings])
                                   (update :findings (partial mapv shape))))
      {"library/overview.dashboard.yaml" "kind: dashboard\nid: 7RZUq1g5o1C5ws_e3ppKf\nname: Overview\n"}
      [{:level :decode :type :unknown-kind :kind :dashboard :path "library/overview.dashboard.yaml"}]

      {golden/total-revenue-path "kind: metric\nid: IW8kbqZVaMxdGtCM2F4U6\nname: Total Revenue\n"}
      [{:level :decode :type :invalid :path golden/total-revenue-path}]

      {"library/copy.metric.yaml" (golden/text (get (golden/tree) golden/total-revenue-path))}
      [{:level :decode :type :duplicate-identity :id golden/total-revenue-id
        :paths ["library/copy.metric.yaml" golden/total-revenue-path]}]

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
      (golden/tree-with {"library/metrics/_collection.yaml" nil})
      [{:level :structural :rule :place-inside :id golden/revenue-id :place golden/metrics-id
        :path "library/metrics/revenue/_collection.yaml"}]

      ;; a containment cycle: the Library moves into one of its own subcollections
      (golden/edit "library/_collection.yaml" #(str % "parent: cOlQuErIeS0ExAmPlE2x1\n"))
      [{:level :structural :rule :acyclic :ids #{golden/library-id golden/metrics-id golden/revenue-id}}]

      ;; a snippet inside a metric
      (golden/edit golden/base-filter-path #(str % "collection: IW8kbqZVaMxdGtCM2F4U6\n"))
      [{:level :structural :rule :kind-fits :id golden/base-filter-id :place golden/total-revenue-id
        :path golden/base-filter-path}]

      ;; a dangling reference: a snippet uses a snippet that is gone
      (golden/tree-with {golden/base-filter-path nil})
      [{:level :structural :rule :refs-closed :id golden/active-filter-id :ref [:snippet golden/base-filter-id]
        :path golden/active-filter-path}]

      ;; a metric at the root level, which is not a fixed root
      (golden/edit golden/total-revenue-path #(str/replace % "collection: cOlQuErIeS0ExAmPlE2x1\n" ""))
      [{:level :structural :rule :root :id golden/total-revenue-id :path golden/total-revenue-path}]

      ;; two snippets with one name
      (golden/edit golden/active-filter-path #(str/replace % "name: Active product filter" "name: Base filter"))
      [{:level :structural :rule :unique-key :kind :snippet :key "Base filter"
        :ids #{golden/base-filter-id golden/active-filter-id}}]

      ;; a child collection in another namespace than its parent
      (golden/edit golden/revenue-path #(str % "namespace: snippets\n"))
      [{:level :structural :rule :namespace :id golden/revenue-id :place golden/metrics-id :path golden/revenue-path}])))

(deftest semantic-findings-test
  (testing "a reference to a table that the manifest does not have is red; the report names the table"
    (let [no-products (golden/manifest-without-products)
          r           (checked (golden/tree) no-products)]
      (is (not (str/includes? (golden/text no-products) "PRODUCTS")))
      (is (= {:green? false :semantic? true
              :findings [{:level :semantic :rule :env-resolves :id golden/by-month-id :path golden/by-month-path
                          :ref [:field [:env ["Sample Database" "PUBLIC" "PRODUCTS" "ID"]]]}
                         {:level :semantic :rule :env-resolves :id golden/by-month-id :path golden/by-month-path
                          :ref [:source-table [:env ["Sample Database" "PUBLIC" "PRODUCTS"]]]}]}
             (select-keys r [:green? :semantic? :findings])))
      (is (some #(and (str/includes? % golden/by-month-id) (str/includes? % "Sample Database.PUBLIC.PRODUCTS"))
                (check/report r)))))
  (testing "a manifest that does not decode is red"
    (is (= [{:level :manifest :type :manifest-unreadable}]
           (mapv #(select-keys % [:level :type]) (:findings (checked (golden/tree) "databases: ["))))))
  (testing "a tree that does not decode gets no semantic check"
    (is (= [:decode] (distinct (map :level (:findings (checked (golden/tree-with {".metabase/format.yaml" nil})))))))))

(deftest lint-test
  (testing "a file at a path that is not its canonical path is green, with a lint"
    (let [moved (-> (golden/tree)
                    (dissoc golden/total-revenue-path)
                    (assoc "library/elsewhere.yaml" (get (golden/tree) golden/total-revenue-path)))]
      (is (= {:green? true :findings []
              :lints [{:rule :canonical-path :id golden/total-revenue-id :path "library/elsewhere.yaml"
                       :canonical golden/total-revenue-path}]}
             (select-keys (checked moved) [:green? :findings :lints]))))))

(deftest foreign-files-keep-the-checker-green-test
  (testing "a README, an app's own files, a broken YAML file and a Kubernetes manifest change nothing: the tree is
           green, with a lint for each foreign YAML file in an area directory"
    (let [r (checked (golden/tree-with golden/app-files))]
      (is (= {:green? true :findings []
              :lints  [{:rule :foreign-file :path "apps/sales/i18n/en.yaml"}
                       {:rule :foreign-file :path "library/broken.yaml"}]}
             (select-keys r [:green? :findings :lints])))
      (is (= (:snapshot (checked (golden/tree))) (:snapshot r)))
      (testing "the report names each lint, and the tree stays green"
        (let [lines (check/report r)]
          (is (str/includes? (first lines) "apps/sales/i18n/en.yaml"))
          (is (= "green" (peek lines)))))))
  (testing "a file with a known kind and an id is an item file: one that does not decode is red"
    (is (= [{:level :decode :type :invalid :path "apps/sales/i18n/en.yaml"}]
           (mapv shape (:findings (checked (golden/tree-with (assoc golden/app-files "apps/sales/i18n/en.yaml"
                                                                    "kind: snippet\nid: 12\nname: x\n")))))))))

;;; ------------------------------------------------------ Report -----------------------------------------------------

(deftest report-test
  (testing "a green tree: one line"
    (is (= ["green"] (check/report (checked (golden/tree))))))
  (testing "a dangling reference names both items, and the file of the user"
    (let [lines (check/report (checked (golden/tree-with {golden/base-filter-path nil})))]
      (is (= 2 (count lines)))
      (is (str/includes? (first lines) golden/active-filter-path))
      (is (str/includes? (first lines) "Active product filter"))
      (is (str/includes? (first lines) golden/active-filter-id))
      (is (str/includes? (first lines) golden/base-filter-id))
      (is (= "red: 1 finding" (peek lines)))))
  (testing "a kind that cannot be in its container names the item and the container"
    (let [[line] (check/report (checked (golden/edit golden/base-filter-path
                                                     #(str % "collection: IW8kbqZVaMxdGtCM2F4U6\n"))))]
      (is (str/includes? line "Base filter"))
      (is (str/includes? line "Total Revenue"))))
  (testing "a key clash names the kind, the key and both items"
    (let [[line] (check/report (checked (golden/edit golden/active-filter-path
                                                     #(str/replace % "name: Active product filter" "name: Base filter"))))]
      (is (str/includes? line "snippet"))
      (is (str/includes? line "\"Base filter\""))
      (is (str/includes? line golden/base-filter-id))
      (is (str/includes? line golden/active-filter-id))
      (is (not (str/includes? line ":rule")) "a sentence, not the finding as data")))
  (testing "a namespace finding names the collection and its parent"
    (let [[line] (check/report (checked (golden/edit golden/revenue-path #(str % "namespace: snippets\n"))))]
      (is (str/includes? line golden/revenue-path))
      (is (str/includes? line "Revenue"))
      (is (str/includes? line "Metrics"))
      (is (str/includes? line "namespace"))
      (is (not (str/includes? line ":rule")) "a sentence, not the finding as data")))
  (testing "a decode finding names its file"
    (is (str/includes? (first (check/report (checked (golden/tree-with {"library/notes.yaml" "kind: metric\nid: 12\n"}))))
                       "library/notes.yaml")))
  (testing "a lint names the file and its canonical path, and the tree stays green"
    (let [moved (-> (golden/tree)
                    (dissoc golden/base-filter-path)
                    (assoc "x.yaml" (get (golden/tree) golden/base-filter-path)))
          lines (check/report (checked moved))]
      (is (str/includes? (first lines) "x.yaml"))
      (is (str/includes? (first lines) golden/base-filter-path))
      (is (= "green" (peek lines))))))

;;; ------------------------------------------------------- Run -------------------------------------------------------

(deftest run-checkout-test
  (with-temp-dir
    (fn [dir]
      (golden/write-tree! dir (assoc (golden/tree) manifest/path golden-manifest))
      (testing "a green checkout exits 0, and the manifest in the checkout is the default"
        (let [out (with-out-str (is (= 0 (check/run (str dir) nil))))]
          (is (= "green\n" out))))
      (testing "a manifest at another path"
        (let [other (io/file dir ".metabase/other.yaml")]
          (spit other "format: library-branching-manifest/1\ndatabases: []\n")
          (let [out (with-out-str (is (= 1 (check/run (str dir) (str other)))))
                n   (count (:findings (checked (golden/tree) (slurp other))))]
            (is (< 1 n))
            (is (str/ends-with? out (str "red: " n " findings\n"))))))
      (testing "a red checkout exits 1"
        (fs/delete (io/file dir golden/base-filter-path))
        (let [out (with-out-str (is (= 1 (check/run (str dir) nil))))]
          (is (str/includes? out golden/active-filter-id)))))))

(deftest parse-args-test
  (is (= {:dir "repo" :manifest nil} (check/parse-args ["repo"])))
  (is (= {:dir "repo" :manifest "m.yaml"} (check/parse-args ["repo" "--manifest" "m.yaml"])))
  (is (nil? (check/parse-args [])))
  (is (nil? (check/parse-args ["repo" "--manifest"])))
  (is (nil? (check/parse-args ["repo" "extra"]))))

;;; ------------------------------------------------------ Variants ---------------------------------------------------

(deftest variants-test
  (testing "the golden variants: each is green or red as its name says, and each red one has a finding of its name"
    (doseq [[n {t :tree m :manifest}] (golden/variants)]
      (testing n
        (let [r (check/check t {:manifest m})]
          (if (str/starts-with? n "green")
            (is (:green? r))
            (case n
              "canonical-path" (is (and (:green? r) (= [:canonical-path] (map :rule (:lints r)))))
              "foreign-files"  (is (and (:green? r) (= #{:foreign-file} (set (map :rule (:lints r))))))
              (is (and (not (:green? r))
                       (some #{(keyword n)} (mapcat (juxt :type :rule) (:findings r))))))))))))

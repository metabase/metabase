(ns metabase-enterprise.library-branching.format.claims-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.collection :as format.collection]
   [metabase-enterprise.library-branching.format.kinds.metric :as format.metric]
   [metabase-enterprise.library-branching.format.kinds.published-table :as format.published-table]
   [metabase-enterprise.library-branching.format.kinds.snippet :as format.snippet]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.manifest-test :as manifest-test]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.registry :as registry])
  (:import
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- tree-of
  "`{path bytes}` of `{path text-or-bytes}`."
  [m]
  (update-vals m #(if (string? %) (utf-8 %) %)))

(defn- groups
  "`{group #{path}}` of the claims `c`, without the empty groups."
  [c]
  (into {} (keep (fn [[k files]] (when (seq files) [k (set (keys files))]))) c))

(defn- group-of
  "`{path group}` of the claims `c`."
  [c]
  (into {} (for [[k files] c, p (keys files)] [p k])))

(defn- sha-256-hex
  ^String [^bytes b]
  (format "%064x" (BigInteger. 1 (.digest (MessageDigest/getInstance "SHA-256") b))))

;;; -------------------------------------------------- Foreign files --------------------------------------------------

(def ^:private png
  (byte-array (map unchecked-byte [0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A 0xFF 0xFE 0x00 0x01])))

(def ^:private foreign-examples
  "Files that claim no item: an app's own files, files of other tools, and YAML that is not an item file."
  {"README.md"                     "# Sales app\n\nRun `npm start`.\n"
   "apps/sales/App.tsx"            "export default function App() { return <div>{t('hello')}</div>; }\n"
   "apps/sales/package.json"       "{\"name\": \"sales\", \"version\": \"1.0.0\"}\n"
   "apps/sales/i18n/en.yaml"       "hello: Hello\nbye: Goodbye\n"
   "apps/sales/logo.png"           png
   "library/broken.yaml"           "kind: metric\nid: [\n"
   "library/list.yaml"             "- kind: collection\n  id: IW8kbqZVaMxdGtCM2F4U6\n"
   "library/no-id.collection.yaml" "kind: collection\nname: No identity\n"
   "deploy/app.yaml"               "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: sales\n"
   "deploy/with-id.yaml"           "kind: Deployment\nid: IW8kbqZVaMxdGtCM2F4U6\nname: sales\n"
   "config/format.yaml"            "format: 1\n"
   "config/json.yaml"              "format: json\n"
   ".github/workflows/check.yaml"  "on: pull_request\njobs: {}\n"
   "notes/empty.yaml"              ""})

(deftest foreign-files-test
  (testing "a README, an app's own files, a broken YAML file, a Kubernetes manifest and YAML that is not an item file
           claim nothing"
    (is (= {:foreign (set (keys foreign-examples))}
           (groups (claims/item-claims (tree-of foreign-examples))))))
  (testing "the kind of an item file is one of the closed set: kind Deployment with an id is foreign"
    (is (= :foreign (get (group-of (claims/item-claims (tree-of foreign-examples))) "deploy/with-id.yaml")))))

(def ^:private item-examples
  {"anywhere/notes.txt"              "kind: snippet\nid: aCtIvEpRoDuCtFiLtEr01\nname: Active\ncontent: x\n"
   "library/overview.dashboard.yaml" "kind: dashboard\nid: 7RZUq1g5o1C5ws_e3ppKf\nname: Overview\n"
   "library/bad.metric.yaml"         "kind: metric\nid: 12\n"
   "flow.yaml"                       "{kind: collection, id: fLoWcOlLeCtIoN0000001, name: Flow}\n"})

(deftest item-files-test
  (testing "a YAML map with a known kind and an id is an item file, at any path, also one that does not decode and
           one of a kind with no codec yet"
    (is (= {:items (set (keys item-examples))}
           (groups (claims/item-claims (tree-of item-examples)))))))

(deftest format-files-test
  (testing "the format version file and the manifest are format files by their content, at any path"
    (is (= {:formats   #{".metabase/format.yaml" "elsewhere/format.yaml"}
            :manifests #{".metabase/manifest.yaml" "ci/manifest.yaml"}}
           (groups (claims/item-claims
                    (tree-of {".metabase/format.yaml"   "format: library-branching/1\n"
                              "elsewhere/format.yaml"   "format: library-branching/2\n"
                              ".metabase/manifest.yaml" (manifest-test/golden-bytes)
                              "ci/manifest.yaml"        "format: library-branching-manifest/1\ndatabases: []\n"})))))))

(def ^:private old-format-file
  "name: Total revenue\nentity_id: OldMetric000000000001\nserdes/meta:\n- id: OldMetric000000000001\n  model: Card\n")

(deftest old-format-test
  (testing "a YAML map with serdes/meta is an item file of the old format"
    (is (= {:old-items #{"collections/main/x.yaml"}}
           (groups (claims/item-claims (tree-of {"collections/main/x.yaml" old-format-file}))))))
  (testing "a tree is in the old format iff it has an old-format item file and no format version file"
    (are [files expected] (= expected (claims/old-format? (claims/item-claims (tree-of files))))
      {}                                                                    false
      {"README.md" "# x\n"}                                                 false
      {"collections/main/x.yaml" old-format-file}                           true
      {"anywhere.yaml" old-format-file "README.md" "# x\n"}                 true
      {"collections/main/x.yaml" "name: x\n"}                               false
      {"collections/main/x.yaml" old-format-file
       ".metabase/format.yaml"   "format: library-branching/1\n"}           false
      {".metabase/format.yaml" "format: library-branching/1\n"}             false)))

(deftest resource-files-test
  (let [bundle (utf-8 "console.log('sales');\n")
        app    (str "kind: data-app\nid: DaTaApPsAlEs000000001\nname: Sales\n"
                    "bundle: sha256:" (sha-256-hex bundle) "\n")]
    (testing "a file whose SHA-256 an item file names is a resource file, at any path"
      (is (= {:items     #{"apps/sales/sales.app.yaml"}
              :resources #{"apps/sales/anywhere.js"}
              :foreign   #{"apps/sales/other.js"}}
             (groups (claims/item-claims (tree-of {"apps/sales/sales.app.yaml" app
                                                   "apps/sales/anywhere.js"    bundle
                                                   "apps/sales/other.js"       "console.log('other');\n"}))))))
    (testing "with no item file that names it, the same file is foreign"
      (is (= {:foreign #{"apps/sales/anywhere.js"}}
             (groups (claims/item-claims (tree-of {"apps/sales/anywhere.js" bundle}))))))))

(deftest kept-and-claimed-files-test
  (let [c (claims/item-claims (tree-of (merge foreign-examples
                                              item-examples
                                              {"collections/main/x.yaml" old-format-file
                                               ".metabase/format.yaml"   "format: library-branching/1\n"
                                               ".metabase/manifest.yaml" (manifest-test/golden-bytes)})))]
    (testing "decode reads the item files and the format version file"
      (is (= (conj (set (keys item-examples)) ".metabase/format.yaml") (set (keys (claims/claimed-files c))))))
    (testing "a push keeps the foreign files and the manifest; it writes the item files and drops the old format"
      (is (= (conj (set (keys foreign-examples)) ".metabase/manifest.yaml") (set (keys (claims/kept-files c))))))))

;;; ------------------------------------------------------ Lints ------------------------------------------------------

(deftest foreign-lints-test
  (testing "a foreign YAML file in an area directory is a lint; other foreign files are not"
    (is (= [{:rule :foreign-file :path "apps/sales/i18n/en.yaml"}
            {:rule :foreign-file :path "library/broken.yaml"}
            {:rule :foreign-file :path "library/list.yaml"}
            {:rule :foreign-file :path "library/no-id.collection.yaml"}]
           (claims/foreign-lints (claims/item-claims (tree-of foreign-examples))))))
  (testing "a foreign .yml file in an area directory is a lint too"
    (is (= [{:rule :foreign-file :path "snippets/notes.yml"}]
           (claims/foreign-lints (claims/item-claims (tree-of {"snippets/notes.yml" "a: 1\n"})))))))

(deftest area-directories-test
  (testing "the directory of each root-level item of each kind is an area directory"
    (let [item  (fn [kind attrs] {:kind kind :name "X" :place nil :refs #{} :attrs attrs})
          homes (concat [(format.collection/home (item :collection {:type "library"}))
                         (format.collection/home (item :collection {}))]
                        (for [ns ["snippets" "transforms" "data-actions" "data-apps"]]
                          (format.collection/home (item :collection {:namespace ns})))
                        [(format.metric/home (item :metric {}))
                         (format.published-table/home (item :published-table {}))
                         (format.snippet/home (item :snippet {}))])]
      (doseq [{:keys [dir segment] :as home} homes]
        (is (contains? claims/area-directories (or (first dir) segment)) (pr-str home))))))

;;; --------------------------------------------------- Properties ----------------------------------------------------

(def ^:private foreign-content-gen
  (gen/one-of [(gen/elements (vals foreign-examples))
               (gen/fmap #(str "# " % "\n") gen/string-alphanumeric)
               (gen/fmap #(str "hello: " % "\n") gen/string-alphanumeric)]))

(def ^:private foreign-dir-gen
  ;; The layout never makes a directory that starts with one _, so these paths never hold an item file.
  (gen/elements ["" "library/_own/" "apps/sales/_src/" "snippets/_x/" ".github/"]))

(def ^:private foreign-tree-gen
  (gen/fmap (fn [entries]
              (into {}
                    (map-indexed (fn [i [dir content]]
                                   [(str dir "_f" i ".yaml") (if (string? content) (utf-8 content) content)]))
                    entries))
            (gen/vector (gen/tuple foreign-dir-gen foreign-content-gen) 0 6)))

(def ^:private app-gen
  "Generates nothing, or the item file of a data app (`:app`) and the resource file that it names (`:bundle`)."
  (gen/one-of [(gen/return {:app {} :bundle {}})
               (gen/fmap (fn [text]
                           (let [b (utf-8 (str "bundle " text))]
                             {:app    {"apps/_app/app.yaml"
                                       (utf-8 (str "kind: data-app\nid: DaTaApPsAlEs000000001\nname: A\n"
                                                   "bundle: sha256:" (sha-256-hex b) "\n"))}
                              :bundle {"apps/_app/bundle.js" b}}))
                         gen/string-alphanumeric)]))

(def ^:private tree-gen
  "Generates the parts of a tree: the encoding of a snapshot (`:items`), foreign files, and perhaps a data app with
  its resource file."
  (gen/fmap (fn [[s foreign {:keys [app bundle]}]]
              {:snapshot s :items (writer/encode-tree kinds/codecs s) :foreign foreign :app app :bundle bundle})
            (gen/tuple (kinds.tu/snapshot-gen 10) foreign-tree-gen app-gen)))

(defn- whole [{:keys [items foreign app bundle]}] (merge foreign app bundle items))

(defspec claims-split-a-tree-test 100
  ;; The claims are a partition of the tree: each file is in one group, with its bytes. An encoded snapshot gives
  ;; its item files and its format version file; the generated foreign files are foreign.
  (prop/for-all [{:keys [items foreign app bundle] :as parts} tree-gen]
    (let [t (whole parts)
          c (claims/item-claims t)]
      (and (= t (apply merge (vals c)))
           (= (count t) (reduce + (map count (vals c))))
           (= (set (keys (merge items app))) (set (keys (claims/claimed-files c))))
           (= #{tree/format-path} (set (keys (:formats c))))
           (= (set (keys foreign)) (set (keys (:foreign c))))
           (= (set (keys bundle)) (set (keys (:resources c))))
           (empty? (:old-items c))
           (empty? (:manifests c))))))

(defspec claims-ignore-paths-test 100
  ;; The path law of the claims: a file's group is a function of the contents of the tree, never of a path. Every
  ;; file gets the path of another file, and keeps its group.
  (prop/for-all [parts tree-gen]
    (let [t       (whole parts)
          paths   (sort (keys t))
          renamed (zipmap (map #(str "r" %) (range)) (reverse paths))
          moved   (into {} (map (fn [[new old]] [new (get t old)])) renamed)
          before  (group-of (claims/item-claims t))
          after   (group-of (claims/item-claims moved))]
      (every? (fn [[new old]] (= (before old) (after new))) renamed))))

(defspec decode-ignores-foreign-files-test 100
  ;; The foreign files of a tree change nothing that decode gives.
  (prop/for-all [{:keys [snapshot items foreign]} tree-gen]
    (= {:snapshot snapshot} (claims/decode kinds/codecs (merge foreign items)))))

;;; -------------------------------------------------- System items ---------------------------------------------------

(def ^:private library-id "librarylibrarylibrary")

(def ^:private library
  {:kind :collection :name "Library" :place nil :refs #{} :attrs {:type "library"}})

(def ^:private sections
  "The three sections of the Library, at the content that the release creates."
  {"librarylibrarydatadat" {:kind :collection :name "Data" :place library-id :refs #{} :attrs {:type "library-data"}}
   "librarylibrarymetrics" {:kind :collection :name "Metrics" :place library-id :refs #{}
                            :attrs {:type "library-metrics"}}
   "librarylibrarydashbrd" {:kind :collection :name "Dashboards" :place library-id :refs #{}
                            :attrs {:type "library-dashboards"}}})

(def ^:private dashboards-id "librarylibrarydashbrd")

(def ^:private team-id "TeamDashboardsColl001")

(def ^:private team
  {:kind :collection :name "Team" :place dashboards-id :refs #{} :attrs {}})

(deftest system-items-test
  (testing "the system items are the three sections of the Library, at their release content"
    (is (= sections claims/system-items))
    (is (every? #(registry/validate ::format.collection/item %) (vals sections))))
  (testing "a snapshot that holds the Library gets each section that it lacks (a repository that predates the
           Dashboards section reads as one that holds it)"
    (is (= (merge {library-id library} sections) (claims/with-system-items {library-id library})))
    (let [s (merge {library-id library team-id team} (dissoc sections dashboards-id))]
      (is (= (assoc s dashboards-id (get sections dashboards-id)) (claims/with-system-items s)))))
  (testing "a section that the snapshot holds keeps its content"
    (let [s (merge {library-id library} (assoc-in sections [dashboards-id :attrs :description] "Ours."))]
      (is (= s (claims/with-system-items s)))))
  (testing "with no Library, no section is added: an instance has the Library only after a person creates it"
    (is (= {} (claims/with-system-items {})))
    (is (= {team-id (assoc team :place nil)} (claims/with-system-items {team-id (assoc team :place nil)}))))
  (testing "a system item at an area root is added to every snapshot: the area root is in every snapshot"
    (let [item {:kind :collection :name "Common" :place "transformstransformst" :refs #{}
                :attrs {:namespace "transforms"}}]
      (is (= {"cOmMoNsYsTeMiTeM0001" item} (claims/with-system-items {"cOmMoNsYsTeMiTeM0001" item} {}))))))

(deftest decode-completes-the-system-items-test
  (testing "decode gives the sections of the Library that the tree of a Library lacks"
    (let [s     (merge {library-id library team-id team} sections)
          files (writer/encode-tree kinds/codecs s)
          path  (some (fn [[p b]] (when (str/includes? (String. ^bytes b "UTF-8") dashboards-id) p))
                      (sort-by key files))]
      (is (= "library/dashboards/_collection.yaml" path))
      (is (= {:snapshot s} (claims/decode kinds/codecs (dissoc files path))))
      (testing "decode-tree alone does not complete it"
        (is (= (dissoc s dashboards-id)
               (:snapshot (tree/decode-tree kinds/codecs (vals (dissoc files path))))))))))

(defspec with-system-items-property-test 100
  ;; Completion keeps every item, is idempotent, and adds only system items whose place is in the result.
  (prop/for-all [s          (kinds.tu/snapshot-gen 10)
                 library?   gen/boolean
                 present    (gen/vector-distinct (gen/elements (keys sections)) {:max-elements 3})]
    (let [s (cond-> (merge s (select-keys sections present))
              library? (assoc library-id library))
          c (claims/with-system-items s)]
      (and (= s (select-keys c (keys s)))
           (= c (claims/with-system-items c))
           (every? (fn [id] (and (contains? sections id) (contains? c (:place (get c id)))))
                   (remove (set (keys s)) (keys c)))
           (if library? (every? #(contains? c %) (keys sections)) (= s c))))))

;;; ---------------------------------------------------- Mutations ----------------------------------------------------

(def ^:private mutations
  [{:name   :any-kind
    :doc    "Every kind is an item kind, so a Kubernetes manifest with an id is an item file and makes CI red."
    :target `claims/claim
    :edits  [[:replace '(contains? item-kinds (keyword kind)) true]]}
   {:name   :no-id
    :doc    "An item file needs no id, so YAML with a kind key alone is an item file."
    :target `claims/claim
    :edits  [[:replace '(contains? doc :id) true]]}
   {:name   :yaml-files-are-items
    :doc    "Every YAML map is an item file (the old rule by path): an app's own i18n/en.yaml makes CI red."
    :target `claims/claim
    :edits  [[:replace '(and (string? kind) (contains? item-kinds (keyword kind)) (contains? doc :id)) true]]}
   {:name   :no-completion
    :doc    "Decode does not complete the system items, so a repository that predates the Dashboards section trashes
            it on a pull."
    :target `claims/with-system-items
    :edits  [[:replace '(recur (into s m)) 's]]}
   {:name   :root-completed
    :doc    "Completion adds a section with no Library, so a pull creates the Library on an instance that has none."
    :target `claims/with-system-items
    :edits  [[:replace '(contains? s place) true]]}
   {:name   :area-root-not-completed
    :doc    "Completion skips a system item at an area root, so a repository that predates it trashes it on a pull."
    :target `claims/with-system-items
    :edits  [[:replace '(contains? snapshot/area-roots place) false]]}
   {:name   :lints-everywhere
    :doc    "Every foreign YAML file is a lint, also one outside the area directories."
    :target `claims/foreign-lints
    :edits  [[:replace '(contains? area-directories (top-directory p)) true]]}
   {:name   :manifest-dropped
    :doc    "A push removes the manifest of the repository."
    :target `claims/kept-files
    :edits  [[:replace '(:manifests claims) nil]]}])

(deftest claims-mutations-test
  (mut/check mutations {:tests [#'foreign-files-test #'item-files-test #'system-items-test #'foreign-lints-test
                                #'kept-and-claimed-files-test #'decode-completes-the-system-items-test]}))

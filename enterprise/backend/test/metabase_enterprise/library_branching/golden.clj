(ns metabase-enterprise.library-branching.golden
  "The golden repository of the checker, and a variant of it for each kind of finding and lint. It loads on the JVM and
  in babashka.

  [[write-results!]] writes each variant to a directory, and the result of the checker on each to a file, for a
  comparison with the checker in babashka."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.format.manifest :as manifest])
  (:import
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(defn utf-8
  "The UTF-8 bytes of `s`."
  ^bytes [^String s]
  (.getBytes s "UTF-8"))

(defn text
  "The text of the UTF-8 bytes `b`."
  ^String [^bytes b]
  (String. b "UTF-8"))

(def dir
  "The golden repository, relative to the root of the Metabase repository."
  "enterprise/backend/test_resources/library_branching/golden")

(def manifest-path
  "The manifest of the golden repository."
  "enterprise/backend/test_resources/library_branching/manifest.yaml")

(defn tree
  "`{path bytes}` of the golden repository."
  []
  (check/tree-files dir))

(defn manifest-bytes
  "The bytes of the golden manifest."
  ^bytes []
  (Files/readAllBytes (.toPath (io/file manifest-path))))

(defn tree-with
  "The golden tree with the files `changes`, `{path text-or-nil}`: a text replaces or adds the file, nil removes it."
  [changes]
  (reduce-kv (fn [t p s] (if (nil? s) (dissoc t p) (assoc t p (utf-8 s)))) (tree) changes))

(defn edit
  "The golden tree with the text of the file `path` changed by `f`."
  [path f]
  (tree-with {path (f (text (get (tree) path)))}))

(def library-id
  "The entity id of the Library collection."
  "LiBrArYcOlLeCtIoN0001")
(def metrics-id
  "The entity id of the Metrics collection."
  "mEtRiCsCoLlEcTiOnId00")
(def revenue-id
  "The entity id of the Revenue collection."
  "cOlQuErIeS0ExAmPlE2x1")
(def total-revenue-id
  "The entity id of the Total Revenue metric."
  "IW8kbqZVaMxdGtCM2F4U6")
(def by-month-id
  "The entity id of the metric that uses Total Revenue."
  "Qx81tWm0aLpN2ZcB7yYgr")
(def base-filter-id
  "The entity id of the Base filter snippet."
  "bAsEfIlTeRsNiPpEt0001")
(def active-filter-id
  "The entity id of the Active product filter snippet, which uses the Base filter."
  "aCtIvEpRoDuCtFiLtEr01")

(def snippets-root
  "The identity of the root of the Snippets area."
  "snippetssnippetssnipp")
(def total-revenue-path
  "The file of the Total Revenue metric."
  "library/metrics/revenue/total_revenue.metric.yaml")
(def by-month-path
  "The file of the metric that uses Total Revenue."
  "library/metrics/revenue/total_revenue~Qx81tWm0aLpN2ZcB7yYgr.metric.yaml")
(def overview-path
  "The file of the dashboard that shows Total Revenue."
  "library/dashboards/revenue_overview.dashboard.yaml")
(def base-filter-path
  "The file of the Base filter snippet."
  "snippets/base_filter.snippet.yaml")
(def active-filter-path
  "The file of the Active product filter snippet."
  "snippets/filters/active_product_filter.snippet.yaml")
(def revenue-path
  "The file of the Revenue collection."
  "library/metrics/revenue/_collection.yaml")

(def ^:private products-table
  "The PRODUCTS table of the golden manifest, as text."
  (str "  - fields:\n"
       "    - {base_type: type/Text, effective_type: type/Text, name: CATEGORY}\n"
       "    - {base_type: type/BigInteger, effective_type: type/BigInteger, name: ID}\n"
       "    name: PRODUCTS\n"
       "    schema: PUBLIC\n"))

(defn manifest-without-products
  "The golden manifest with no PRODUCTS table."
  ^bytes []
  (utf-8 (str/replace (text (manifest-bytes)) products-table "")))

(def app-files
  "The own files of a data app, a broken YAML file and a Kubernetes manifest: foreign files."
  {"apps/sales/App.tsx"      "export default function App() { return null; }\n"
   "apps/sales/package.json" "{\"name\": \"sales\"}\n"
   "apps/sales/i18n/en.yaml" "hello: Hello\n"
   "library/broken.yaml"     "kind: metric\nid: [\n"
   "README.md"               "# Library\n"
   "deploy/app.yaml"         "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: sales\n"})

(defn variants
  "`{name {:tree {path bytes} :manifest bytes-or-nil}}`: the golden repository with and without its manifest, and a
  variant for each kind of finding and lint."
  []
  (let [golden (tree)
        m      (manifest-bytes)
        v      (fn [t] {:tree t :manifest m})]
    {"green"                  (v golden)
     "green-without-manifest" {:tree golden :manifest nil}
     "unknown-kind"           (v (tree-with {"library/overview.document.yaml"
                                             "kind: document\nid: dOcUmEnTdOcUmEnTdOc01\nname: Overview\n"}))
     "invalid"                (v (tree-with {total-revenue-path "kind: metric\nid: IW8kbqZVaMxdGtCM2F4U6\nname: Total Revenue\n"}))
     "duplicate-identity"     (v (assoc golden "library/copy.metric.yaml" (get golden total-revenue-path)))
     "no-format"              (v (tree-with {".metabase/format.yaml" nil}))
     "unknown-format"         (v (tree-with {".metabase/format.yaml" "format: library-branching/2\n"}))
     "duplicate-format"       (v (tree-with {"library/format.yaml" "format: library-branching/1\n"}))
     "place-inside"           (v (tree-with {"library/metrics/_collection.yaml" nil}))
     "acyclic"                (v (edit "library/_collection.yaml" #(str % "parent: " revenue-id "\n")))
     "kind-fits"              (v (edit base-filter-path #(str/replace % (str "collection: " snippets-root "\n")
                                                                      (str "collection: " total-revenue-id "\n"))))
     "area-root"              (v (tree-with {"library/fake/_collection.yaml"
                                             (str "kind: collection\nid: " snippets-root "\nname: Fake\nparent: "
                                                  library-id "\n")}))
     "refs-closed"            (v (tree-with {base-filter-path nil}))
     "root"                   (v (edit total-revenue-path #(str/replace % (str "collection: " revenue-id "\n") "")))
     "unique-key"             (v (edit active-filter-path #(str/replace % "name: Active product filter" "name: Base filter")))
     "namespace"              (v (edit revenue-path #(str % "namespace: snippets\n")))
     "env-resolves"           {:tree golden :manifest (manifest-without-products)}
     "manifest-unreadable"    {:tree golden :manifest (utf-8 "databases: [")}
     "canonical-path"         (v (-> golden
                                     (dissoc total-revenue-path)
                                     (assoc "library/elsewhere.yaml" (get golden total-revenue-path))))
     "foreign-files"          (v (merge golden (update-vals app-files utf-8)))}))

(defn write-tree!
  "Writes the tree `t`, `{path bytes-or-text}`, under directory `dir`."
  [dir t]
  (doseq [[p content] t]
    (let [f (io/file dir p)]
      (io/make-parents f)
      (if (string? content) (spit f content) (fs/write-bytes f content)))))

(defn write-variant!
  "Writes variant `v` of [[variants]] to directory `dir`, with its manifest at the default path of the checker."
  [dir {t :tree m :manifest}]
  (write-tree! dir (cond-> t m (assoc manifest/path m))))

(defn run-result
  "`{:exit e :lines [line ...]}`: the exit code and the printed lines of [[check/run]] on directory `dir`."
  [dir]
  (let [exit (volatile! nil)
        out  (with-out-str (vreset! exit (check/run (str dir) nil)))]
    {:exit @exit :lines (str/split-lines out)}))

(defn write-results!
  "Writes each variant to `<out>/<name>` (with its manifest at `.metabase/manifest.yaml`, when it has one), and
  `{name {:exit e :lines [line ...]}}`, the result of [[check/run]] on each, as EDN to the file `results`. An exec
  function: `clojure -X:ee:ee-dev metabase-enterprise.library-branching.golden/write-results! :out <dir> :results <file>`."
  [{:keys [out results]}]
  (spit (str results)
        (pr-str (into (sorted-map)
                      (for [[n v] (variants)
                            :let  [d (io/file (str out) n)]]
                        (do (write-variant! d v)
                            [n (run-result d)]))))))

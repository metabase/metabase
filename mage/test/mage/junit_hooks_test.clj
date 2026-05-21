(ns mage.junit-hooks-test
  (:require
   [babashka.fs :as fs]
   [clojure.data.xml :as xml]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.junit-hooks :as junit-hooks]))

(set! *warn-on-reflection* true)

(def ^:private fix #'junit-hooks/fix)
(def ^:private rewrite-doc #'junit-hooks/rewrite-doc)
(def ^:private spec-file #'junit-hooks/spec-file)

;; A failing `before each` hook, as mocha-junit-reporter records it.
(def ^:private mocha-xml
  (str "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
       "<testsuites name=\"Mocha Tests\" tests=\"1\" failures=\"1\">\n"
       "  <testsuite name=\"Root Suite\" file=\"e2e/test/foo.cy.spec.js\" tests=\"1\">\n"
       "    <testcase name=\"Login &quot;before each&quot; hook for &quot;works&quot;\""
       " classname=\"Login works\" time=\"0.1\">\n"
       "      <failure message=\"boom &lt;x&gt; &amp; y\" type=\"AssertionError\">"
       "<![CDATA[stack < > & trace]]></failure>\n"
       "    </testcase>\n"
       "  </testsuite>\n"
       "</testsuites>\n"))

;; Backend / Jest style JUnit: no mocha hook label anywhere.
(def ^:private backend-xml
  (str "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
       "<testsuites><testsuite name=\"metabase.foo-test\">"
       "<testcase name=\"does a thing\" classname=\"metabase.foo-test\" time=\"0.02\"/>"
       "</testsuite></testsuites>"))

(defn- testcase-names [doc]
  (->> (tree-seq map? :content doc)
       (filter #(and (map? %) (= :testcase (:tag %))))
       (map (comp :name :attrs))))

(defn- failure-text [doc]
  (->> (tree-seq map? :content doc)
       (filter #(and (map? %) (= :failure (:tag %))))
       (mapcat :content)
       (filter string?)
       (apply str)))

(defn- with-temp-junit-dir
  "Creates a temp dir populated from `files` (a map of filename -> content),
  invokes `f` with the dir path, then cleans up."
  [files f]
  (let [dir (str (fs/create-temp-dir {:prefix "mage-junit-hooks-test"}))]
    (try
      (doseq [[name content] files]
        (spit (str dir "/" name) content))
      (f dir)
      (finally (fs/delete-tree dir)))))

(defn- quietly
  "Run `f`, swallowing the task's stderr summary output."
  [f]
  (binding [*err* (java.io.StringWriter.)]
    (f)))

(deftest fix-strips-hook-label-test
  (testing "strips the hook label, keeping the suite prefix and test name"
    (is (= "Login works"
           (fix "Login \"before each\" hook for \"works\""))))
  (testing "handles every before/after each/all variant"
    (doseq [hook ["before each" "before all" "after each" "after all"]]
      (is (= "Suite the test"
             (fix (str "Suite \"" hook "\" hook for \"the test\"")))
          (str "should rewrite a " hook " hook"))))
  (testing "leaves ordinary test names untouched"
    (is (= "just a normal test" (fix "just a normal test"))))
  (testing "passes non-strings through unchanged (e.g. a missing attribute)"
    (is (nil? (fix nil)))
    (is (= 42 (fix 42)))))

(deftest rewrite-doc-test
  (let [[doc' {:keys [scanned rewrites]}] (rewrite-doc (xml/parse-str mocha-xml))]
    (testing "counts every testcase and reports the single rewrite"
      (is (= 1 scanned))
      (is (= [["Login \"before each\" hook for \"works\"" "Login works"]] rewrites)))
    (testing "fixes both name and classname on the rebuilt doc"
      (is (= ["Login works"] (testcase-names doc')))
      (is (not (str/includes? (xml/emit-str doc') "hook for"))))
    (testing "re-emits to valid, re-parseable XML"
      (is (= ["Login works"]
             (testcase-names (xml/parse-str (xml/emit-str doc'))))))))

(deftest spec-file-test
  (testing "reads the spec path from the Root Suite file= attribute"
    (is (= "e2e/test/foo.cy.spec.js" (spec-file (xml/parse-str mocha-xml)))))
  (testing "returns nil when no file= attribute is present"
    (is (nil? (spec-file (xml/parse-str backend-xml))))))

(deftest rewrite-writes-fixed-xml-test
  (with-temp-junit-dir
    {"results.xml" mocha-xml}
    (fn [dir]
      (quietly #(junit-hooks/rewrite {:options {} :arguments [dir]}))
      (let [doc (xml/parse-str (slurp (str dir "/results.xml")))]
        (is (= ["Login works"] (testcase-names doc))
            "hook label is stripped on disk")
        ;; data.xml re-emits the CDATA failure body as escaped text; the value is
        ;; preserved (verified by re-parsing), only its representation changes.
        (is (= "stack < > & trace" (failure-text doc))
            "failure body survives the round-trip")))))

(deftest rewrite-dry-run-leaves-files-untouched-test
  (with-temp-junit-dir
    {"results.xml" mocha-xml}
    (fn [dir]
      (quietly #(junit-hooks/rewrite {:options {:dry-run true} :arguments [dir]}))
      (is (= mocha-xml (slurp (str dir "/results.xml")))
          "dry-run must not modify the file"))))

(deftest rewrite-passthrough-for-non-mocha-junit-test
  (testing "files without a hook label (backend, Jest) are left byte-identical"
    (with-temp-junit-dir
      {"backend.xml" backend-xml}
      (fn [dir]
        (quietly #(junit-hooks/rewrite {:options {} :arguments [dir]}))
        (is (= backend-xml (slurp (str dir "/backend.xml"))))))))

(deftest rewrite-include-filter-test
  (testing "--include skips files whose spec path does not match"
    (with-temp-junit-dir
      {"results.xml" mocha-xml}
      (fn [dir]
        (quietly #(junit-hooks/rewrite {:options {:include ["does-not-match"]} :arguments [dir]}))
        (is (= mocha-xml (slurp (str dir "/results.xml")))
            "non-matching spec path is skipped, file unchanged"))))
  (testing "--include rewrites files whose spec path matches"
    (with-temp-junit-dir
      {"results.xml" mocha-xml}
      (fn [dir]
        (quietly #(junit-hooks/rewrite {:options {:include ["foo.cy.spec.js"]} :arguments [dir]}))
        (is (= ["Login works"]
               (testcase-names (xml/parse-str (slurp (str dir "/results.xml")))))
            "matching spec path is rewritten")))))

(deftest rewrite-does-not-add-missing-attributes-test
  (testing "a testcase without a classname does not gain a nil one"
    (let [no-classname (str "<testsuites><testsuite file=\"x.cy.spec.js\">"
                            "<testcase name=\"S &quot;before all&quot; hook for &quot;t&quot;\"/>"
                            "</testsuite></testsuites>")]
      (with-temp-junit-dir
        {"results.xml" no-classname}
        (fn [dir]
          (quietly #(junit-hooks/rewrite {:options {} :arguments [dir]}))
          (let [tc (->> (xml/parse-str (slurp (str dir "/results.xml")))
                        (tree-seq map? :content)
                        (filter #(and (map? %) (= :testcase (:tag %))))
                        first)]
            (is (= "S t" (get-in tc [:attrs :name])) "name is rewritten")
            (is (not (contains? (:attrs tc) :classname))
                "absent classname stays absent")))))))

(deftest rewrite-rejects-non-directory-test
  (is (thrown? clojure.lang.ExceptionInfo
               (junit-hooks/rewrite {:options {} :arguments ["/no/such/dir/here"]}))))

(def keep-me "Ensures this namespace is loaded by mage.core-test")

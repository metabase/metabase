(ns metabase-enterprise.library-branching.external-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.external :as external]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.golden :as golden]
   [metabase.cmd.core :as cmd]))

(set! *warn-on-reflection* true)

(def ^:private total-line
  "{base_type: type/Float, effective_type: type/Float, name: TOTAL}")

(defn- manifest-with-text-total
  "The golden manifest in which ORDERS.TOTAL is a text field."
  ^bytes []
  (let [text (golden/text (golden/manifest-bytes))]
    (assert (str/includes? text total-line))
    (golden/utf-8 (str/replace text total-line "{base_type: type/Text, effective_type: type/Text, name: TOTAL}"))))

(defn- with-temp-dir
  [f]
  (let [dir (fs/file (fs/create-temp-dir {:prefix "library-branching-external-"}))]
    (try (f dir) (finally (fs/delete-tree dir)))))

(deftest golden-repository-is-green-test
  (testing "the golden repository with its manifest: green, as for the lightweight checker"
    (let [r (external/check (golden/tree) {:manifest (golden/manifest-bytes)})]
      (is (= {:green? true :findings [] :semantic? true}
             (select-keys r [:green? :findings :semantic?]))))))

(deftest a-query-of-the-wrong-type-is-red-test
  (let [r (external/check (golden/tree) {:manifest (manifest-with-text-total)})]
    (testing "the manifest says that ORDERS.TOTAL is text: each query that uses it as a number is a semantic finding,
             with the file of its item"
      (is (false? (:green? r)))
      (is (= [{:level :semantic :rule :query-typed :id golden/total-revenue-id :path golden/total-revenue-path}
              {:level :semantic :rule :query-typed :id "lArGeOrDeRsSeGmEnT001"
               :path  "library/data/orders.table/large_orders.segment.yaml"}
              {:level :semantic :rule :query-typed :id "oRdErToTaLmEaSuRe0001"
               :path  "library/data/orders.table/order_total.measure.yaml"}]
             (mapv #(select-keys % [:level :rule :id :path]) (:findings r)))))
    (testing "the report names the item, the place in its query and the type that the clause needs"
      (let [lines (check/report r)]
        (is (= (str golden/total-revenue-path ": metric \"Total Revenue\" (" golden/total-revenue-id ") has a query that"
                    " does not fit the types of the manifest: stages.0.aggregation.0.2: an expression returning a"
                    " number.")
               (first lines)))
        (is (= "red: 3 findings" (last lines))))))
  (testing "the lightweight checker does not type queries: the same checkout is green there"
    (is (:green? (check/check (golden/tree) {:manifest (manifest-with-text-total)})))))

(deftest no-manifest-no-typing-test
  (testing "with no manifest, the external check is the structural check"
    (is (= (check/check (golden/tree) {}) (external/check (golden/tree) {}))))
  (testing "a tree that does not decode is not typed"
    (let [t (golden/tree-with {golden/total-revenue-path "kind: metric\nid: IW8kbqZVaMxdGtCM2F4U6\nname: Total Revenue\n"})
          r (external/check t {:manifest (manifest-with-text-total)})]
      (is (= [:decode] (distinct (map :level (:findings r))))))))

(deftest command-test
  (with-temp-dir
    (fn [dir]
      (golden/write-tree! dir (golden/tree))
      (testing "green: the report on stdout, and the command returns"
        (is (= "green\n" (with-out-str (is (nil? (external/command! (str dir) {:manifest golden/manifest-path})))))))
      (testing "the manifest of the checkout is the default"
        (golden/write-tree! dir {manifest/path (manifest-with-text-total)})
        (let [out (with-out-str
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"red"
                                          (external/command! (str dir) {}))))]
          (is (str/ends-with? out "red: 3 findings\n"))))
      (testing "a red check ends the command with exit code 1"
        (is (true? (:cmd/exit (ex-data (try (with-out-str (external/command! (str dir) {}))
                                            (catch clojure.lang.ExceptionInfo e e))))))))))

(deftest jar-command-test
  (testing "the command of the Metabase JAR runs the external check, with the manifest option"
    (is (= "green\n"
           (with-out-str (is (nil? (cmd/library-branching-check golden/dir "--manifest" golden/manifest-path))))))))

(ns metabase-enterprise.semantic-layer-import.ossie.document-test
  "[[metabase-enterprise.semantic-layer-import.ossie.document]]: the two document shapes read into one, and what is
  refused up front."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-layer-import.ossie.document :as document]
   [metabase-enterprise.semantic-layer-import.ossie.test-util :as tu]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- shape
  "What a model says, independent of the document shape it was written in."
  [model]
  {:name          (:name model)
   :datasets      (mapv (fn [{dataset-name :name, :keys [source fields], primary-key :primary_key}]
                          [dataset-name source primary-key (mapv :name fields)])
                        (:datasets model))
   :relationships (mapv (juxt :name :from :to :from_columns :to_columns) (:relationships model))
   :metrics       (mapv (juxt :name (comp :expression first :dialects :expression)) (:metrics model))})

(deftest ^:parallel both-shapes-test
  (testing "the same model in the 0.1.1 and 0.2.0.dev0 shapes reads the same, apart from the version"
    (let [v01 (document/read-document tu/tpch-document)
          v02 (document/read-document tu/tpch-document-v02)]
      (is (mr/validate ::document/model v01))
      (is (= "0.1.1" (:version v01)))
      (is (= "0.2.0.dev0" (:version v02)))
      (is (= (shape v01) (shape v02)))
      (is (= ["lineitem" "orders" "customer" "nation" "region"] (map :name (:datasets v02))))
      (is (= ["net_revenue" "gross_revenue" "order_count" "average_order_value"] (map :name (:metrics v02)))))))

(deftest ^:parallel json-test
  (testing "a JSON document reads like a YAML one; a 0.1.1 wrapper around one model is read"
    (let [model (document/read-document (tu/fixture "duckdb_ossie/invalid/semantic_model_wrapper.json"))]
      (is (= {:version "0.1.1", :name "pre_0_2_shape", :datasets [{:name "t", :source "tpcds.public.t"}]}
             model))))
  (testing "dataset-scoped metrics are read next to a dataset's fields"
    (let [model (document/read-document (tu/fixture "apache/compliance/scott/scott_model.ossie.yaml"))]
      (is (= ["sum_sal" "emp_count" "comm_count" "sum_comm"]
             (map :name (:metrics (first (:datasets model)))))))))

(deftest ^:parallel version-test
  (testing "a document without a version is read by its shape"
    (is (= "0.1.1" (:version (document/model {:semantic_model [{:name "m", :datasets [{:name "t", :source "t"}]}]}))))
    (is (= "0.2.0.dev0" (:version (document/model {:name "m", :datasets [{:name "t", :source "t"}]})))))
  (testing "a version the import does not read is refused before anything else is looked at"
    (is (thrown-with-msg? ExceptionInfo #"Unsupported Ossie document: the import reads documents of version 0\.1\.1 or 0\.2\.0\.dev0, this one says \"0\.3\.0\""
                          (document/model {:version "0.3.0", :name "m", :datasets [{:name "t", :source "t"}]})))
    (is (thrown-with-msg? ExceptionInfo #"this one says nil"
                          (document/model {:foo "bar"}))))
  (testing "a version and a shape that disagree are refused as the version's schema says"
    (is (thrown-with-msg? ExceptionInfo #"Invalid Ossie document"
                          (document/model {:version "0.2.0.dev0", :semantic_model [{:name "m", :datasets [{:name "t", :source "t"}]}]})))
    (is (thrown-with-msg? ExceptionInfo #"Invalid Ossie document"
                          (document/model {:version "0.1.1", :name "m", :datasets [{:name "t", :source "t"}]}))))
  (testing "a 0.1.1 document holds one model"
    (is (thrown-with-msg? ExceptionInfo #"semantic_model holds 2 \(\"a\", \"b\"\); split the document"
                          (document/model {:version        "0.1.1"
                                           :semantic_model [{:name "a", :datasets [{:name "t", :source "t"}]}
                                                            {:name "b", :datasets [{:name "t", :source "t"}]}]})))
    (is (thrown-with-msg? ExceptionInfo #"semantic_model holds 0"
                          (document/model {:version "0.1.1", :semantic_model []})))))

(deftest ^:parallel invalid-test
  (testing "a document that does not match its shape's schema is refused with the explanation"
    (let [explain (fn [raw]
                    (try
                      (document/model raw)
                      (catch ExceptionInfo e
                        [(ex-message e) (:errors (ex-data e))])))]
      (is (=? ["Invalid Ossie document" {:datasets ["missing required key"]}]
              (explain {:version "0.2.0.dev0", :name "m"})))
      (is (=? ["Invalid Ossie document" {:datasets ["should have at least 1 elements"]}]
              (explain {:version "0.2.0.dev0", :name "m", :datasets []})))
      (is (=? ["Invalid Ossie document"
               {:datasets [{:fields [{:expression ["an expression has a `sql` or at least one entry in `dialects`"]}]}]}]
              (explain {:version  "0.2.0.dev0"
                        :name     "m"
                        :datasets [{:name "t", :source "t", :fields [{:name "f", :expression {}}]}]})))
      (is (=? ["Invalid Ossie document" {:relationships [{:from_columns ["should have at least 1 elements"]}]}]
              (explain {:version       "0.2.0.dev0"
                        :name          "m"
                        :datasets      [{:name "t", :source "t"}]
                        :relationships [{:name "r", :from "t", :to "t", :from_columns [], :to_columns ["x"]}]})))
      (testing "a key that is not text is no key the schemas name, and the document is checked as it is"
        (is (=? ["Invalid Ossie document" {:name ["missing required key"]}]
                (explain {1 "one", :datasets [{:name "t", :source "t"}]})))))))

(deftest ^:parallel coercion-test
  (testing "text YAML typed as a number or a boolean is read as its text, names and expressions included"
    (let [model (document/model {:version  "0.2.0.dev0"
                                 :name     123
                                 :datasets [{:name        "t"
                                             :source      "t"
                                             :description 1.5
                                             :fields      [{:name        "f"
                                                            :expression  {:sql 1}
                                                            :description true
                                                            :label       7}]}]})]
      (is (= "123" (:name model)))
      (is (= "1.5" (-> model :datasets first :description)))
      (is (= "1" (-> model :datasets first :fields first :expression :sql)))
      (is (= ["true" "7"] ((juxt :description :label) (-> model :datasets first :fields first))))))
  (testing "the hostile-but-legal YAML of the duckdb-ossie fixture reads"
    (let [model  (document/read-document (tu/fixture "duckdb_ossie/yaml_edge_cases.yaml"))
          fields (into {} (map (juxt :name identity)) (-> model :datasets first :fields))]
      (is (= "shared via a YAML anchor" (-> model :datasets first :description)))
      (is (= "truncated here" (get-in fields ["hash_unquoted" :description])))
      (is (= "1.5" (get-in fields ["numeric_desc" :description])))
      (is (= "CASE WHEN k > 1\n     THEN 'big'\n     ELSE 'small' END"
             (-> fields (get "blocky") :expression :dialects first :expression)))
      (is (= "k + 1" (-> fields (get "folded") :expression :dialects first :expression))))))

(deftest read-document-errors-test
  (testing "every failure to read a file names it"
    (mt/with-temp-dir [dir nil]
      (let [write! (fn [filename content]
                     (let [f (io/file dir filename)]
                       (spit f content)
                       (str f)))]
        (is (thrown-with-msg? ExceptionInfo #"Cannot read Ossie document .*broken\.yaml: "
                              (document/read-document (tu/fixture "duckdb_ossie/invalid/broken.yaml"))))
        (is (thrown-with-msg? ExceptionInfo #"Cannot read Ossie document .*nope\.json"
                              (document/read-document (write! "nope.json" "{"))))
        (is (thrown-with-msg? ExceptionInfo #"Invalid Ossie document .*empty\.yaml: the file is empty"
                              (document/read-document (write! "empty.yaml" ""))))
        (is (thrown-with-msg? ExceptionInfo #"Invalid Ossie document .*list\.yaml: the file holds a list, not a mapping"
                              (document/read-document (write! "list.yaml" "- a\n- b\n"))))
        (is (thrown-with-msg? ExceptionInfo #"Invalid Ossie document .*scalar\.yaml: the file holds a value that is not a mapping"
                              (document/read-document (write! "scalar.yaml" "just text\n"))))
        (is (thrown-with-msg? ExceptionInfo #"Unsupported Ossie document: .* \(.*v3\.yaml\)"
                              (document/read-document (write! "v3.yaml" "version: 9.9\nname: m\ndatasets: [{name: t, source: t}]\n"))))
        (testing "a mapping with a key twice is refused rather than read as its last value"
          (is (thrown-with-msg? ExceptionInfo #"(?s)Cannot read Ossie document .*twice\.yaml: .*duplicate key"
                                (document/read-document (write! "twice.yaml" "name: a\nname: b\ndatasets: [{name: t, source: t}]\n")))))
        (testing "a document nested absurdly deep is refused before it overflows the stack"
          (is (thrown-with-msg? ExceptionInfo #"Cannot read Ossie document .*deep\.yaml: .*Nesting Depth"
                                (document/read-document (write! "deep.yaml" (str "name: " (str/join (repeat 2000 "[")) (str/join (repeat 2000 "]")) "\n"))))))
        (let [e (try
                  (document/read-document (write! "bad.yaml" "version: 0.2.0.dev0\nname: m\n"))
                  (catch ExceptionInfo e e))]
          (is (re-find #"^Invalid Ossie document \(.*bad\.yaml\)$" (ex-message e)))
          (is (=? {:path #".*bad\.yaml", :errors {:datasets ["missing required key"]}} (ex-data e))))))))

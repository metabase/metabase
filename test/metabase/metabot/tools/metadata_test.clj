(ns metabase.metabot.tools.metadata-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [clojure.xml :as xml]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.metadata :as metadata])
  (:import
   (java.io ByteArrayInputStream)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- parse-model-result-xml
  [output]
  (let [prefix "<result>\n"
        suffix "\n</result>\n<instructions>\n"
        end    (str/index-of output suffix)
        body   (subs output (count prefix) end)]
    (xml/parse (ByteArrayInputStream. (.getBytes ^String body StandardCharsets/UTF_8)))))

(defn- field-result
  [values]
  {:structured-output
   {:result-type    :field-metadata
    :field_id       42
    :portable_fk    ["Sample Database" "PUBLIC" "ORDERS" "CATEGORY"]
    :table_reference "orders"
    :value_metadata {:field_values values
                     :statistics   {:distinct-count (count values)
                                    :percent-null   0.1}}}})

(deftest get-field-values-bounded-model-output-test
  (testing "high-cardinality samples get deterministic compact XML without changing the full result"
    (let [values (into ["P&L <north>"] (map #(format "value-%03d" %) (range 1 100)))
          raw    (field-result values)
          call   #(with-redefs [field-stats/field-values (constantly raw)]
                    (metadata/get-field-values-tool
                     {:data_source "table" :source_id 1 :field_id 42}))
          result (call)
          root   (parse-model-result-xml (:model-output result))
          nodes  (into [] (filter map?) (:content root))]
      (is (= values (get-in result [:structured-output :value_metadata :field_values])))
      (is (str/includes? (:output result) "value-099")
          "the client/audit output remains complete")
      (is (str/includes? (:model-output result) "value-019"))
      (is (not (str/includes? (:model-output result) "value-020")))
      (is (str/includes? (:model-output result)
                         "<sample-values-summary returned-count=\"100\" shown-count=\"20\" truncated=\"true\" />"))
      (is (= :field-metadata-result (:tag root))
          "compact metadata and its truncation summary share one explicit XML root")
      (is (= [:field-metadata :sample-values-summary] (mapv :tag nodes)))
      (is (= {:returned-count "100" :shown-count "20" :truncated "true"}
             (:attrs (second nodes))))
      (is (str/includes? (:model-output result) "field_id=\"42\""))
      (is (str/includes? (:model-output result) "PUBLIC.ORDERS (via orders)"))
      (is (str/includes? (:model-output result) "sample-distinct-count"))
      (is (str/includes? (:model-output result) "P&amp;L &lt;north&gt;")
          "sample values are structurally rendered and XML-escaped, not substring-truncated")
      (is (< (count (:model-output result)) (count (:output result))))
      (is (= (:model-output result) (:model-output (call)))
          "the bounded sample is deterministic")))
  (testing "small results use the existing output fallback without duplicating it"
    (with-redefs [field-stats/field-values (constantly (field-result ["a" "b"]))]
      (let [result (metadata/get-field-values-tool
                    {:data_source "table" :source_id 1 :field_id 42})]
        (is (string? (:output result)))
        (is (not (contains? result :model-output))))))
  (testing "errors remain unchanged and do not acquire a compact result"
    (with-redefs [field-stats/field-values (constantly {:output "Permission denied"})]
      (is (= {:output "Permission denied"}
             (metadata/get-field-values-tool
              {:data_source "table" :source_id 1 :field_id 42}))))))

(ns metabase.analyze.classifiers.data-sensitivity-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.data-sensitivity :as classifiers.data-sensitivity]
   [metabase.lib.schema.metadata :as lib.schema.metadata]))

(defn- infer
  ([field-name base-type]
   (infer field-name base-type nil nil))
  ([field-name base-type semantic-type table-context]
   (classifiers.data-sensitivity/infer-data-sensitivity
    {:name field-name :base_type base-type :semantic_type semantic-type}
    table-context)))

(deftest ^:parallel name->tokens-test
  (testing "separators and camelCase all tokenize to the same tokens and adjacent pair"
    (doseq [s ["firstName" "first_name" "FIRST-NAME" "first.name" "first name"]]
      (testing (pr-str s)
        (is (= {:tokens #{"first" "name"} :pairs #{"first_name"}}
               (#'classifiers.data-sensitivity/name->tokens s))))))
  (testing "tokens are whole words, not substrings"
    (let [{:keys [tokens]} (#'classifiers.data-sensitivity/name->tokens "zip_code")]
      (is (= #{"zip" "code"} tokens))
      (is (not (contains? tokens "ip")))))
  (testing "a single token has no pairs"
    (is (= {:tokens #{"ssn"} :pairs #{}}
           (#'classifiers.data-sensitivity/name->tokens "SSN")))))

(deftest ^:parallel one-positive-case-per-category-test
  (doseq [[field-name base-type semantic-type table-context expected]
          [["password"    :type/Text    nil nil :SEC_KEY]
           ["ip_address"  :type/Text    nil nil :SYS_TELEMETRY]
           ["diagnosis"   :type/Text    nil nil :PHI]
           ["dna"         :type/Text    nil nil :BIO_GEN]
           ["card_number" :type/Integer nil nil :PCI_FIN]
           ["gender"      :type/Text    nil nil :SENS_PERS]
           ["ssn"         :type/Text    nil nil :PII]
           ["source_code" :type/Text    nil nil :CORP_IP]
           ["salary"      :type/Float   nil nil :BIZ_CONF]]]
    (testing (pr-str (list 'infer-data-sensitivity field-name base-type semantic-type table-context))
      (is (= expected
             (infer field-name base-type semantic-type table-context))))))

(deftest ^:parallel base-type-gates-token-rules-test
  (testing "a token rule only fires when the base type isa? one of the rule's base types"
    (is (= :BIZ_CONF (infer "salary" :type/Integer)))
    (is (nil? (infer "salary" :type/Text)))
    (is (= :SEC_KEY (infer "password" :type/Text)))
    (is (nil? (infer "password" :type/Integer)))))

(deftest ^:parallel no-match-returns-nil-test
  (testing "unmatched names return nil rather than :PUBLIC"
    (doseq [field-name ["foo" "zip_code" "description" "" "id"]]
      (testing (pr-str field-name)
        (is (nil? (infer field-name :type/Text)))))))

(deftest ^:parallel precedence-test
  (testing "the earliest category in column-data-sensitivity-types wins when several rules match"
    (is (= :PCI_FIN (infer "ssn_card_number" :type/Text)))
    (is (= :SEC_KEY (infer "ssn_password" :type/Text)))
    (is (= :SEC_KEY (infer "salary_password" :type/Text)))))

(deftest ^:parallel user-table-gate-test
  (testing "geography semantic types imply PII only on a UserTable"
    (is (nil? (infer "city" :type/Text :type/City {:entity_type :entity/GenericTable})))
    (is (nil? (infer "city" :type/Text :type/City nil)))
    (is (= :PII (infer "city" :type/Text :type/City {:entity_type :entity/UserTable}))))
  (testing "descendant semantic types match through isa?"
    (is (= :PII (infer "lat" :type/Float :type/Latitude {:entity_type :entity/UserTable})))
    (is (nil? (infer "lat" :type/Float :type/Latitude {:entity_type :entity/GenericTable}))))
  (testing "explicit name tokens fire regardless of table"
    (is (= :PII (infer "first_name" :type/Text nil {:entity_type :entity/GenericTable})))
    (is (= :PII (infer "first_name" :type/Text nil {:entity_type :entity/UserTable}))))
  (testing "ungated semantic types fire regardless of table"
    (is (= :PII (infer "col_3" :type/Text :type/Email {:entity_type :entity/GenericTable}))))
  (testing "semantic types outside both maps do not match"
    (is (nil? (infer "kind" :type/Text :type/Category {:entity_type :entity/UserTable})))))

(deftest ^:parallel table-booster-test
  (testing "a weak field token is promoted only when the table name supplies the context"
    (is (nil? (infer "notes" :type/Text nil nil)))
    (is (nil? (infer "notes" :type/Text nil {:name "products"})))
    (is (= :PHI (infer "notes" :type/Text nil {:name "patient_visits"})))
    (is (= :PHI (infer "NOTES" :type/Text nil {:name "PATIENT_VISITS"})))))

(deftest ^:parallel fingerprint-rule-test
  (let [infer-fp (fn [base-type percent-email]
                   (classifiers.data-sensitivity/infer-data-sensitivity
                    {:name        "col_7"
                     :base_type   base-type
                     :fingerprint {:type {:type/Text {:percent-email percent-email}}}}
                    nil))]
    (testing "a text column whose values are almost all emails is PII"
      (is (= :PII (infer-fp :type/Text 0.97))))
    (testing "below the threshold nothing matches"
      (is (nil? (infer-fp :type/Text 0.5))))
    (testing "the rule only applies to text base types"
      (is (nil? (infer-fp :type/Integer 0.97))))
    (testing "a missing fingerprint is not an error"
      (is (nil? (infer "col_7" :type/Text))))))

(deftest ^:parallel rule-data-invariants-test
  (let [categories      (set lib.schema.metadata/column-data-sensitivity-types)
        valid-category? (fn [c] (and (contains? categories c) (not= :PUBLIC c)))
        valid-token?    (fn [t] (re-matches #"[a-z0-9]+(?:_[a-z0-9]+)?" t))
        base-types-ok?  (fn [bts] (and (set? bts) (seq bts) (every? #(isa? % :type/*) bts)))]
    (testing "no rule outputs :PUBLIC and every output is an enum member"
      (doseq [[_ _ category] (concat @#'classifiers.data-sensitivity/token-rules
                                     @#'classifiers.data-sensitivity/stem-rules
                                     @#'classifiers.data-sensitivity/table-boosters)]
        (is (valid-category? category) (pr-str category)))
      (doseq [[_ category] (concat @#'classifiers.data-sensitivity/semantic-type->category
                                   @#'classifiers.data-sensitivity/user-table-semantic-type->category)]
        (is (valid-category? category) (pr-str category))))
    (testing "token rules use lowercase tokens or single underscore pairs and valid base types"
      (doseq [[tokens base-types _] @#'classifiers.data-sensitivity/token-rules]
        (is (set? tokens))
        (is (every? valid-token? tokens) (pr-str tokens))
        (is (base-types-ok? base-types) (pr-str base-types))))
    (testing "stem rules are compiled patterns with valid base types"
      (doseq [[pattern base-types _] @#'classifiers.data-sensitivity/stem-rules]
        (is (instance? java.util.regex.Pattern pattern))
        (is (base-types-ok? base-types) (pr-str base-types))))
    (testing "semantic maps key on semantic types"
      (doseq [[semantic-type _] (concat @#'classifiers.data-sensitivity/semantic-type->category
                                        @#'classifiers.data-sensitivity/user-table-semantic-type->category)]
        (is (isa? semantic-type :Semantic/*) (pr-str semantic-type))))
    (testing "booster token sets are lowercase tokens"
      (doseq [[field-tokens table-tokens _] @#'classifiers.data-sensitivity/table-boosters]
        (is (every? valid-token? field-tokens) (pr-str field-tokens))
        (is (every? valid-token? table-tokens) (pr-str table-tokens))))))

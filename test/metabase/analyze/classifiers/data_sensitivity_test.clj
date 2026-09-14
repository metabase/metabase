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
  (testing "pairs are adjacent only"
    (is (= #{"date_of" "of_birth"}
           (:pairs (#'classifiers.data-sensitivity/name->tokens "date_of_birth")))))
  (testing "a single token has no pairs"
    (is (= {:tokens #{"ssn"} :pairs #{}}
           (#'classifiers.data-sensitivity/name->tokens "SSN")))))

(deftest ^:parallel positive-cases-per-category-test
  (doseq [[field-name base-type semantic-type table-context expected]
          [["password"          :type/Text     nil nil :SEC_KEY]
           ["apiKey"            :type/Text     nil nil :SEC_KEY]
           ["refresh_token"     :type/Text     nil nil :SEC_KEY]
           ["client_secret"     :type/Text     nil nil :SEC_KEY]
           ["salt"              :type/Text     nil nil :SEC_KEY]
           ["ip_address"        :type/Text     nil nil :SYS_TELEMETRY]
           ["client_ip"         :type/Text     nil nil :SYS_TELEMETRY]
           ["user_agent"        :type/Text     nil nil :SYS_TELEMETRY]
           ["mac_address"       :type/Text     nil nil :SYS_TELEMETRY]
           ["device_id"         :type/Integer  nil nil :SYS_TELEMETRY]
           ["diagnosis"         :type/Text     nil nil :PHI]
           ["diagnosis_code"    :type/Text     nil nil :PHI]
           ["icd10"             :type/Text     nil nil :PHI]
           ["patient_id"        :type/Integer  nil nil :PHI]
           ["bmi"               :type/Float    nil nil :PHI]
           ["dna"               :type/Text     nil nil :BIO_GEN]
           ["fingerprint"       :type/Text     nil nil :BIO_GEN]
           ["retina_scan"       :type/Text     nil nil :BIO_GEN]
           ["face_id"           :type/Text     nil nil :BIO_GEN]
           ["card_number"       :type/Integer  nil nil :PCI_FIN]
           ["credit_card"       :type/Text     nil nil :PCI_FIN]
           ["cvv"               :type/Integer  nil nil :PCI_FIN]
           ["iban"              :type/Text     nil nil :PCI_FIN]
           ["routing_number"    :type/Text     nil nil :PCI_FIN]
           ["gender"            :type/Text     nil nil :SENS_PERS]
           ["sex"               :type/Text     nil nil :SENS_PERS]
           ["ethnicity"         :type/Text     nil nil :SENS_PERS]
           ["religion"          :type/Text     nil nil :SENS_PERS]
           ["is_pregnant"       :type/Boolean  nil nil :SENS_PERS]
           ["ssn"               :type/Text     nil nil :PII]
           ["passport_number"   :type/Text     nil nil :PII]
           ["date_of_birth"     :type/Date     nil nil :PII]
           ["email_address"     :type/Text     nil nil :PII]
           ["phone"             :type/Text     nil nil :PII]
           ["phone_number"      :type/Integer  nil nil :PII]
           ["shipping_address"  :type/Text     nil nil :PII]
           ["source_code"       :type/Text     nil nil :CORP_IP]
           ["repo_url"          :type/Text     nil nil :CORP_IP]
           ["algorithm"         :type/Text     nil nil :CORP_IP]
           ["salary"            :type/Float    nil nil :BIZ_CONF]
           ["revenue"           :type/Decimal  nil nil :BIZ_CONF]
           ["gross_margin"      :type/Float    nil nil :BIZ_CONF]]]
    (testing (pr-str (list 'infer-data-sensitivity field-name base-type semantic-type table-context))
      (is (= expected
             (infer field-name base-type semantic-type table-context))))))

(deftest ^:parallel base-type-gates-token-rules-test
  (testing "a token rule only fires when the base type isa? one of the rule's base types"
    (is (= :BIZ_CONF (infer "salary" :type/Integer)))
    (is (nil? (infer "salary" :type/Text)))
    (is (= :SEC_KEY (infer "password" :type/Text)))
    (is (nil? (infer "password" :type/Integer)))
    (is (= :SENS_PERS (infer "race" :type/Text)))
    (is (nil? (infer "race_id" :type/Integer)))
    (is (= :PHI (infer "patient" :type/Text)))
    (is (nil? (infer "patient_count" :type/Integer)))))

(deftest ^:parallel non-text-base-types-test
  (testing "IPAddress and Structured base types, which are not descendants of :type/Text, match the text rules that list them"
    (is (= :SYS_TELEMETRY (infer "client_ip" :type/IPAddress)))
    (is (= :SYS_TELEMETRY (infer "mac_address" :type/Structured)))
    (is (= :SEC_KEY       (infer "credentials" :type/JSON)))
    (is (= :SEC_KEY       (infer "password" :type/XML)))
    (is (= :PHI           (infer "medical_history" :type/JSON))))
  (testing "an IPAddress base type implies SYS_TELEMETRY whatever the column is named"
    (is (= :SYS_TELEMETRY (infer "foo" :type/IPAddress))))
  (testing "rules that stay text-only do not match structured columns"
    (is (nil? (infer "home_address" :type/JSON)))
    (is (nil? (infer "source_code" :type/JSON)))
    (is (nil? (infer "settings" :type/JSON)))))

(deftest ^:parallel integer-and-band-variants-test
  (testing "dob matches as an integer as well as a date or text"
    (is (= :PII (infer "dob" :type/Integer)))
    (is (= :PII (infer "dob" :type/Date)))
    (is (= :PII (infer "dob" :type/Text)))
    (is (nil? (infer "dob" :type/Boolean)))
    (is (nil? (infer "birthday" :type/Integer))))
  (testing "salary and compensation bands match as text or integer codes while bare salary stays numeric-only"
    (is (= :BIZ_CONF (infer "salary_band" :type/Text)))
    (is (= :BIZ_CONF (infer "compensation_tier" :type/Text)))
    (is (= :BIZ_CONF (infer "pay_grade" :type/Integer)))
    (is (nil? (infer "salary" :type/Text)))
    (is (nil? (infer "salary_currency" :type/Text)))))

(deftest ^:parallel false-positives-test
  (testing "names that share a substring or token with a rule but are not sensitive return nil"
    (doseq [[field-name base-type]
            [["zip_code"                 :type/Text]
             ["ship_date"                :type/Date]
             ["shipping_address_id"      :type/Integer]
             ["description"              :type/Text]
             ["monkey"                   :type/Text]
             ["foreign_key"              :type/Integer]
             ["primary_key"              :type/Integer]
             ["key_id"                   :type/Integer]
             ["token_count"              :type/Integer]
             ["session_count"            :type/Integer]
             ["hostname_count"           :type/Integer]
             ["content_hash"             :type/Text]
             ["adobe_id"                 :type/Text]
             ["sussex"                   :type/Text]
             ["product_name"             :type/Text]
             ["filename"                 :type/Text]
             ["age"                      :type/Integer]
             ["address"                  :type/Text]
             ["city"                     :type/Text]
             ["state"                    :type/Text]
             ["country"                  :type/Text]
             ["name"                     :type/Text]
             ["phone_id"                 :type/Integer]
             ["password_changed_at"      :type/DateTime]
             ["passwordless_login_count" :type/Integer]
             ["emailed_at"               :type/DateTime]
             ["email_count"              :type/Integer]
             ["businessName"             :type/Text]
             ["business_name"            :type/Text]
             ["secretary"                :type/Text]
             ["disabled"                 :type/Boolean]
             ["condition"                :type/Text]
             ["treatment"                :type/Text]
             ["margin_top"               :type/Text]
             ["token"                    :type/Text]]]
      (testing (pr-str field-name)
        (is (nil? (infer field-name base-type))))))
  (testing "geography semantic types alone do not imply PII outside a UserTable"
    (is (nil? (infer "state" :type/Text :type/State {:entity_type :entity/GenericTable})))
    (is (nil? (infer "state" :type/Text :type/State {:name "orders"})))))

(deftest ^:parallel stem-rules-test
  (testing "stems catch spellings the tokenizer splits differently"
    (is (= :PII     (infer "ssn4" :type/Text)))
    (is (= :PII     (infer "last4ssn" :type/Text)))
    (is (= :PII     (infer "passportno" :type/Text)))
    (is (= :PII     (infer "userbirthdate" :type/Date)))
    (is (= :PII     (infer "useremail" :type/Text)))
    (is (= :SEC_KEY (infer "passwd" :type/Text)))
    (is (= :SEC_KEY (infer "clientsecret" :type/Text)))
    (is (= :PCI_FIN (infer "cardcvv" :type/Text)))
    (is (= :PCI_FIN (infer "ibannumber" :type/Text))))
  (testing "stems are bounded so common words containing them do not match"
    (is (nil? (infer "businessname" :type/Text)))
    (is (nil? (infer "secretary" :type/Text)))
    (is (nil? (infer "birthday_reminder_sent" :type/Boolean)))))

(deftest ^:parallel precedence-test
  (testing "the earliest category in column-data-sensitivity-types wins when several rules match"
    (is (= :PCI_FIN       (infer "ssn_card_number" :type/Text)))
    (is (= :SEC_KEY       (infer "ssn_password" :type/Text)))
    (is (= :SEC_KEY       (infer "salary_password" :type/Text)))
    (is (= :SYS_TELEMETRY (infer "device_fingerprint" :type/Text)))
    (is (= :SEC_KEY       (infer "device_token" :type/Text)))
    (is (= :PHI           (infer "patient_email" :type/Text)))))

(deftest ^:parallel user-table-gate-test
  (testing "geography and name semantic types imply PII only on a UserTable"
    (doseq [semantic-type [:type/Name :type/Address :type/City :type/State :type/Country :type/ZipCode
                           :type/Latitude :type/Longitude :type/User :type/Author]]
      (testing (pr-str semantic-type)
        (is (nil? (infer "col" :type/Text semantic-type {:entity_type :entity/GenericTable})))
        (is (nil? (infer "col" :type/Text semantic-type nil)))
        (is (= :PII (infer "col" :type/Text semantic-type {:entity_type :entity/UserTable}))))))
  (testing "explicit name tokens fire regardless of table"
    (is (= :PII (infer "first_name" :type/Text nil {:entity_type :entity/GenericTable})))
    (is (= :PII (infer "first_name" :type/Text nil {:entity_type :entity/UserTable}))))
  (testing "ungated semantic types fire regardless of table"
    (is (= :PII           (infer "col_3" :type/Text :type/Email {:entity_type :entity/GenericTable})))
    (is (= :PII           (infer "col_4" :type/Date :type/Birthdate {:entity_type :entity/GenericTable})))
    (is (= :SYS_TELEMETRY (infer "col_5" :type/Text :type/IPAddress {:entity_type :entity/GenericTable}))))
  (testing "semantic types outside both maps do not match"
    (doseq [semantic-type [:type/Category :type/Title :type/Description :type/Company :type/Income :type/Cost
                           :type/PK :type/FK :type/CreationTimestamp]]
      (testing (pr-str semantic-type)
        (is (nil? (infer "kind" :type/Text semantic-type {:entity_type :entity/UserTable})))))))

(deftest ^:parallel table-booster-test
  (testing "a weak field token is promoted only when the table name supplies the context"
    (is (nil?     (infer "notes" :type/Text nil nil)))
    (is (nil?     (infer "notes" :type/Text nil {:name "products"})))
    (is (= :PHI   (infer "notes" :type/Text nil {:name "patient_visits"})))
    (is (= :PHI   (infer "NOTES" :type/Text nil {:name "PATIENT_VISITS"})))
    (is (= :PHI   (infer "condition" :type/Text nil {:name "patients"})))
    (is (= :SEC_KEY (infer "token" :type/Text nil {:name "sessions"})))
    (is (= :SEC_KEY (infer "key" :type/Text nil {:name "api_keys"})))
    (is (nil?     (infer "key" :type/Text nil {:name "settings"})))
    (is (= :BIO_GEN (infer "template" :type/Text nil {:name "fingerprint_templates"})))
    (is (= :PCI_FIN (infer "number" :type/Text nil {:name "credit_cards"})))
    (is (= :PCI_FIN (infer "last4" :type/Text nil {:name "cards"})))
    (is (nil?     (infer "number" :type/Text nil {:name "invoices"})))
    (is (= :PII   (infer "name" :type/Text nil {:name "customers"})))
    (is (= :PII   (infer "age" :type/Integer nil {:name "users"})))
    (is (= :PII   (infer "address" :type/Text nil {:name "employees"})))
    (is (nil?     (infer "name" :type/Text nil {:name "products"})))
    (is (= :BIZ_CONF (infer "amount" :type/Float nil {:name "deals"})))
    (is (nil?     (infer "amount" :type/Float nil {:name "orders"})))))

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

(def sample-database-fields
  "`[table entity-type field base-type semantic-type]` for every column of the Sample Database, as synced on H2."
  [["ACCOUNTS"        :entity/UserTable        "ACTIVE_SUBSCRIPTION" :type/Boolean    nil]
   ["ACCOUNTS"        :entity/UserTable        "CANCELED_AT"         :type/DateTime   :type/CancelationTimestamp]
   ["ACCOUNTS"        :entity/UserTable        "COUNTRY"             :type/Text       :type/Country]
   ["ACCOUNTS"        :entity/UserTable        "CREATED_AT"          :type/DateTime   :type/CreationTimestamp]
   ["ACCOUNTS"        :entity/UserTable        "EMAIL"               :type/Text       :type/Email]
   ["ACCOUNTS"        :entity/UserTable        "FIRST_NAME"          :type/Text       :type/Name]
   ["ACCOUNTS"        :entity/UserTable        "ID"                  :type/BigInteger :type/PK]
   ["ACCOUNTS"        :entity/UserTable        "LAST_NAME"           :type/Text       :type/Name]
   ["ACCOUNTS"        :entity/UserTable        "LATITUDE"            :type/Float      :type/Latitude]
   ["ACCOUNTS"        :entity/UserTable        "LEGACY_PLAN"         :type/Boolean    nil]
   ["ACCOUNTS"        :entity/UserTable        "LONGITUDE"           :type/Float      :type/Longitude]
   ["ACCOUNTS"        :entity/UserTable        "PLAN"                :type/Text       :type/Category]
   ["ACCOUNTS"        :entity/UserTable        "SEATS"               :type/Integer    nil]
   ["ACCOUNTS"        :entity/UserTable        "SOURCE"              :type/Text       :type/Source]
   ["ACCOUNTS"        :entity/UserTable        "TRIAL_CONVERTED"     :type/Boolean    nil]
   ["ACCOUNTS"        :entity/UserTable        "TRIAL_ENDS_AT"       :type/DateTime   nil]
   ["ANALYTIC_EVENTS" :entity/EventTable       "ACCOUNT_ID"          :type/BigInteger :type/FK]
   ["ANALYTIC_EVENTS" :entity/EventTable       "BUTTON_LABEL"        :type/Text       :type/Category]
   ["ANALYTIC_EVENTS" :entity/EventTable       "EVENT"               :type/Text       :type/Category]
   ["ANALYTIC_EVENTS" :entity/EventTable       "ID"                  :type/BigInteger :type/PK]
   ["ANALYTIC_EVENTS" :entity/EventTable       "PAGE_URL"            :type/Text       :type/URL]
   ["ANALYTIC_EVENTS" :entity/EventTable       "TIMESTAMP"           :type/DateTime   nil]
   ["FEEDBACK"        :entity/GenericTable     "ACCOUNT_ID"          :type/BigInteger :type/FK]
   ["FEEDBACK"        :entity/GenericTable     "BODY"                :type/Text       nil]
   ["FEEDBACK"        :entity/GenericTable     "DATE_RECEIVED"       :type/DateTime   nil]
   ["FEEDBACK"        :entity/GenericTable     "EMAIL"               :type/Text       :type/Email]
   ["FEEDBACK"        :entity/GenericTable     "ID"                  :type/BigInteger :type/PK]
   ["FEEDBACK"        :entity/GenericTable     "RATING"              :type/Integer    :type/Score]
   ["FEEDBACK"        :entity/GenericTable     "RATING_MAPPED"       :type/Text       :type/Category]
   ["INVOICES"        :entity/GenericTable     "ACCOUNT_ID"          :type/BigInteger :type/FK]
   ["INVOICES"        :entity/GenericTable     "DATE_RECEIVED"       :type/DateTime   nil]
   ["INVOICES"        :entity/GenericTable     "EXPECTED_INVOICE"    :type/Boolean    nil]
   ["INVOICES"        :entity/GenericTable     "ID"                  :type/BigInteger :type/PK]
   ["INVOICES"        :entity/GenericTable     "PAYMENT"             :type/Float      nil]
   ["INVOICES"        :entity/GenericTable     "PLAN"                :type/Text       :type/Category]
   ["ORDERS"          :entity/TransactionTable "CREATED_AT"          :type/DateTime   :type/CreationTimestamp]
   ["ORDERS"          :entity/TransactionTable "DISCOUNT"            :type/Float      :type/Discount]
   ["ORDERS"          :entity/TransactionTable "ID"                  :type/BigInteger :type/PK]
   ["ORDERS"          :entity/TransactionTable "PRODUCT_ID"          :type/Integer    :type/FK]
   ["ORDERS"          :entity/TransactionTable "QUANTITY"            :type/Integer    :type/Quantity]
   ["ORDERS"          :entity/TransactionTable "SUBTOTAL"            :type/Float      nil]
   ["ORDERS"          :entity/TransactionTable "TAX"                 :type/Float      nil]
   ["ORDERS"          :entity/TransactionTable "TOTAL"               :type/Float      nil]
   ["ORDERS"          :entity/TransactionTable "USER_ID"             :type/Integer    :type/FK]
   ["PEOPLE"          :entity/UserTable        "ADDRESS"             :type/Text       nil]
   ["PEOPLE"          :entity/UserTable        "BIRTH_DATE"          :type/Date       nil]
   ["PEOPLE"          :entity/UserTable        "CITY"                :type/Text       :type/City]
   ["PEOPLE"          :entity/UserTable        "CREATED_AT"          :type/DateTime   :type/CreationTimestamp]
   ["PEOPLE"          :entity/UserTable        "EMAIL"               :type/Text       :type/Email]
   ["PEOPLE"          :entity/UserTable        "ID"                  :type/BigInteger :type/PK]
   ["PEOPLE"          :entity/UserTable        "LATITUDE"            :type/Float      :type/Latitude]
   ["PEOPLE"          :entity/UserTable        "LONGITUDE"           :type/Float      :type/Longitude]
   ["PEOPLE"          :entity/UserTable        "NAME"                :type/Text       :type/Name]
   ["PEOPLE"          :entity/UserTable        "PASSWORD"            :type/Text       nil]
   ["PEOPLE"          :entity/UserTable        "SOURCE"              :type/Text       :type/Source]
   ["PEOPLE"          :entity/UserTable        "STATE"               :type/Text       :type/State]
   ["PEOPLE"          :entity/UserTable        "ZIP"                 :type/Text       :type/ZipCode]
   ["PRODUCTS"        :entity/ProductTable     "CATEGORY"            :type/Text       :type/Category]
   ["PRODUCTS"        :entity/ProductTable     "CREATED_AT"          :type/DateTime   :type/CreationTimestamp]
   ["PRODUCTS"        :entity/ProductTable     "EAN"                 :type/Text       nil]
   ["PRODUCTS"        :entity/ProductTable     "ID"                  :type/BigInteger :type/PK]
   ["PRODUCTS"        :entity/ProductTable     "PRICE"               :type/Float      nil]
   ["PRODUCTS"        :entity/ProductTable     "RATING"              :type/Float      :type/Score]
   ["PRODUCTS"        :entity/ProductTable     "TITLE"               :type/Text       :type/Title]
   ["PRODUCTS"        :entity/ProductTable     "VENDOR"              :type/Text       :type/Company]
   ["REVIEWS"         :entity/GenericTable     "BODY"                :type/Text       :type/Description]
   ["REVIEWS"         :entity/GenericTable     "CREATED_AT"          :type/DateTime   :type/CreationTimestamp]
   ["REVIEWS"         :entity/GenericTable     "ID"                  :type/BigInteger :type/PK]
   ["REVIEWS"         :entity/GenericTable     "PRODUCT_ID"          :type/Integer    :type/FK]
   ["REVIEWS"         :entity/GenericTable     "RATING"              :type/Integer    :type/Score]
   ["REVIEWS"         :entity/GenericTable     "REVIEWER"            :type/Text       nil]])

(def sample-database-expectations
  "Expected `data_sensitivity` for every Sample Database column after one scan, keyed by `[table field]`. Every
  column absent from this map is expected to be `:PUBLIC`."
  {["ACCOUNTS" "COUNTRY"]    :PII
   ["ACCOUNTS" "EMAIL"]      :PII
   ["ACCOUNTS" "FIRST_NAME"] :PII
   ["ACCOUNTS" "LAST_NAME"]  :PII
   ["ACCOUNTS" "LATITUDE"]   :PII
   ["ACCOUNTS" "LONGITUDE"]  :PII
   ["FEEDBACK" "EMAIL"]      :PII
   ["PEOPLE"   "ADDRESS"]    :PII
   ["PEOPLE"   "BIRTH_DATE"] :PII
   ["PEOPLE"   "CITY"]       :PII
   ["PEOPLE"   "EMAIL"]      :PII
   ["PEOPLE"   "LATITUDE"]   :PII
   ["PEOPLE"   "LONGITUDE"]  :PII
   ["PEOPLE"   "NAME"]       :PII
   ["PEOPLE"   "PASSWORD"]   :SEC_KEY
   ["PEOPLE"   "STATE"]      :PII
   ["PEOPLE"   "ZIP"]        :PII})

(deftest ^:parallel sample-database-test
  (testing "every Sample Database column classifies to its expected category, or nil where PUBLIC is expected"
    (doseq [[table entity-type field base-type semantic-type] sample-database-fields]
      (testing (str table "." field)
        (is (= (get sample-database-expectations [table field] :PUBLIC)
               (or (infer field base-type semantic-type {:name table :entity_type entity-type})
                   :PUBLIC)))))))

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
    (testing "every rule token can be produced by the tokenizer, so no rule is unreachable"
      (doseq [[tokens _ _] @#'classifiers.data-sensitivity/token-rules
              token        tokens
              :let [{:keys [tokens pairs]} (#'classifiers.data-sensitivity/name->tokens token)]]
        (is (contains? (into tokens pairs) token) token)))
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

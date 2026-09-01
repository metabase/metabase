(ns metabase.analyze.classifiers.data-sensitivity
  "Classifier that infers the `data_sensitivity` category of a Field from deterministic rules over its name, base
  type, semantic type, fingerprint, and the name and entity type of its Table. Pure: no app-DB access, no settings."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:private text-type             #{:type/Text})
(def ^:private int-or-text-type      #{:type/Integer :type/Text})
(def ^:private text-or-bool-type     #{:type/Text :type/Boolean})
(def ^:private temporal-or-text-type #{:type/Temporal :type/Text})
(def ^:private number-type           #{:type/Number})
(def ^:private any-type              #{:type/*})

(defn- name->tokens
  "Lowercased tokens of a physical column or table name, split on `_`, `-`, `.`, whitespace, and camelCase
  boundaries, plus every adjacent pair joined with `_`."
  [s]
  (let [tokens (->> (str/replace s #"(?<=[a-z0-9])(?=[A-Z])" "_")
                    u/lower-case-en
                    (#(str/split % #"[_\-.\s]+"))
                    (remove str/blank?)
                    vec)]
    {:tokens (set tokens)
     :pairs  (set (map #(str %1 "_" %2) tokens (rest tokens)))}))

;; Tuples of `[#{token-or-pair ...} set-of-valid-base-types category]`. A field matches when any of its tokens or
;; adjacent-token pairs is in the set and its base type `isa?` one of the base types. Bare `key`, `token`, `hash`,
;; `name`, `address`, `city`, `state`, `zip`, `country`, `age` are deliberately absent: they collide with
;; `foreign_key`, `token_count`, `product_name`, `orders.state`; the semantic-type maps and table boosters below
;; cover them where the table supplies context.
(def ^:private token-rules
  [;; SEC_KEY: credentials, keys, tokens, and hashes that grant access.
   [#{"password" "passwd" "pwd" "passphrase" "password_hash" "pwd_hash" "salt" "pin" "pin_code"
      "secret" "secrets" "client_secret" "api_secret" "mfa_secret" "totp_secret" "webhook_secret" "signing_secret"
      "api_key" "apikey" "access_key" "secret_key" "private_key" "ssh_key" "pgp_key" "gpg_key" "signing_key"
      "encryption_key" "master_key" "license_key"
      "api_token" "access_token" "auth_token" "refresh_token" "session_token" "bearer_token" "csrf_token"
      "oauth_token" "id_token" "reset_token" "verification_token" "device_token" "bearer" "jwt"
      "otp" "totp" "credential" "credentials" "security_answer" "recovery_code" "recovery_codes" "backup_codes"
      "connection_string"}
    text-type :SEC_KEY]
   ;; SYS_TELEMETRY: infrastructure identifiers and machine telemetry.
   [#{"ip" "ip_address" "ip_addr" "ipaddress" "ipv4" "ipv6" "client_ip" "remote_ip" "remote_addr" "source_ip"
      "src_ip" "dest_ip" "dst_ip" "server_ip" "host_ip" "mac_address" "mac_addr" "macaddress" "hostname" "host_name"
      "user_agent" "useragent" "device_fingerprint" "browser_fingerprint"}
    text-type :SYS_TELEMETRY]
   [#{"device_id" "imei" "imsi" "iccid" "serial_number" "session_id" "trace_id" "span_id" "request_id"
      "correlation_id"}
    int-or-text-type :SYS_TELEMETRY]
   ;; PHI: health status, diagnoses, treatment, and insurance.
   [#{"diagnosis" "diagnoses" "diagnosis_code" "icd" "icd9" "icd10" "icd_code" "cpt" "cpt_code" "medication"
      "medications" "prescription" "prescriptions" "allergy" "allergies" "symptom" "symptoms" "immunization"
      "vaccination" "vaccine" "blood_type" "medical_history" "medical_condition" "health_condition" "mental_health"
      "therapy" "dosage" "lab_result" "lab_results" "treatment_plan" "clinical_notes" "chief_complaint" "hiv"
      "hiv_status" "patient" "medical_record"}
    text-type :PHI]
   [#{"patient_id" "mrn" "npi" "insurance_id" "insurance_number" "rx_number" "rx_id"}
    int-or-text-type :PHI]
   [#{"bmi" "blood_pressure" "heart_rate" "glucose" "cholesterol"}
    any-type :PHI]
   ;; BIO_GEN: biometric and genetic identifiers.
   [#{"fingerprint" "fingerprints" "retina" "iris" "face_id" "faceprint" "voiceprint" "face_encoding"
      "face_embedding" "facial_recognition" "dna" "genome" "genotype" "genetic" "biometric" "biometrics"}
    any-type :BIO_GEN]
   ;; PCI_FIN: payment card and financial account data.
   [#{"card_number" "cardnumber" "card_num" "card_no" "cc_number" "cc_num" "ccnum" "ccn" "credit_card" "creditcard"
      "debit_card" "debitcard" "pan" "cvv" "cvc" "cvv2" "cvc2" "card_expiry" "card_expiration" "card_last4"
      "cardholder" "cardholder_name" "iban" "bic" "swift_code" "swift_bic" "routing_number" "routing_no"
      "aba_number" "sort_code" "account_number" "account_no" "acct_number" "acct_no" "bank_account"}
    int-or-text-type :PCI_FIN]
   ;; SENS_PERS: GDPR special categories (race, ethnicity, religion, politics, union, sexual orientation,
   ;; health-adjacent traits) plus gender and sex by policy (D14).
   [#{"race" "ethnicity" "ethnic_origin" "religion" "religious_affiliation" "political_affiliation"
      "political_party" "political_views" "union_member" "union_membership" "trade_union" "sexual_orientation"
      "sexuality" "gender" "gender_identity" "sex" "disability" "disabilities" "pregnancy" "pregnant"
      "veteran_status" "criminal_record" "criminal_history" "conviction" "convictions"}
    text-or-bool-type :SENS_PERS]
   ;; PII: direct personal identifiers and contact data. Government identifiers fire on any type.
   [#{"ssn" "social_security" "national_id" "national_identifier" "nin" "nino" "passport"
      "passport_number" "passport_no" "driver_license" "drivers_license" "driving_license" "driver_licence"
      "drivers_licence" "dl_number" "license_plate" "licence_plate" "plate_number" "vin" "tax_id" "taxpayer_id"
      "tin" "itin" "ein" "sin_number" "aadhaar" "aadhar"}
    any-type :PII]
   [#{"dob" "of_birth" "birth_date" "birthdate" "birthday" "birth_day" "birth_place" "birth_city" "birth_country"}
    temporal-or-text-type :PII]
   [#{"birth_year"}
    int-or-text-type :PII]
   [#{"first_name" "firstname" "last_name" "lastname" "full_name" "fullname" "surname" "given_name" "middle_name"
      "maiden_name" "family_name" "forename" "username" "user_name" "customer_name" "employee_name" "contact_name"
      "person_name" "recipient_name" "sender_name"
      "email" "emails" "email_address" "e_mail" "personal_email" "work_email" "contact_email"
      "home_address" "mailing_address" "street_address" "postal_address" "billing_address" "shipping_address"
      "residential_address" "address_line" "address_line1" "address_line2" "address1" "address2" "addr1" "addr2"}
    text-type :PII]
   [#{"phone" "telephone" "mobile_phone" "cell_phone" "cellphone" "home_phone" "work_phone" "contact_phone" "fax"}
    text-type :PII]
   [#{"phone_number" "phone_no" "phone_num" "mobile_number" "mobile_no" "cell_number" "contact_number" "fax_number"}
    int-or-text-type :PII]
   ;; CORP_IP: source code, designs, and proprietary algorithms.
   [#{"source_code" "sourcecode" "code_snippet" "repo_url" "repository_url" "private_repo" "patent"
      "patent_number" "design_doc" "design_document" "algorithm" "model_weights" "proprietary"
      "schematic" "schematics" "blueprint" "blueprints"}
    text-type :CORP_IP]
   ;; BIZ_CONF: internal financials and confidential business figures.
   [#{"salary" "salaries" "compensation" "wage" "wages" "bonus" "payroll" "pay_rate" "hourly_rate" "annual_income"
      "revenue" "profit" "margin" "gross_margin" "net_income" "operating_income" "ebitda" "cost_basis" "forecast"
      "budget" "contract_value" "deal_size" "deal_value"}
    number-type :BIZ_CONF]])

;; Tuples of `[regex set-of-valid-base-types category]` matched with `re-find` against the whole lowercased name.
;; Reserved for true substrings that tokenizing misses (`ssn4`, `passportno`, `cardcvv`); keep short.
(def ^:private stem-rules
  [[#"passw"           text-type             :SEC_KEY]
   [#"secret(?!ar)"    text-type             :SEC_KEY]
   [#"cv[vc]"          int-or-text-type      :PCI_FIN]
   [#"iban"            int-or-text-type      :PCI_FIN]
   [#"(?<![a-z])ssn"   any-type              :PII]
   [#"passport"        any-type              :PII]
   [#"birthda"         temporal-or-text-type :PII]
   [#"email"           text-type             :PII]])

;; Semantic types that imply a category regardless of table. Consulted with `isa?` so descendants match.
(def ^:private semantic-type->category
  {:type/Email     :PII
   :type/Birthdate :PII
   :type/IPAddress :SYS_TELEMETRY})

;; Semantic types that imply a category only when the table's `entity_type` is `:entity/UserTable`.
(def ^:private user-table-semantic-type->category
  {:type/Name       :PII
   :type/Address    :PII
   :type/City       :PII
   :type/State      :PII
   :type/Country    :PII
   :type/ZipCode    :PII
   :type/Coordinate :PII
   :type/User       :PII})

;; Tuples of `[#{field-token ...} #{table-token ...} category]`. Promotes a weak field signal when the table name
;; supplies the context.
(def ^:private table-boosters
  [[#{"token" "tokens" "key" "keys" "hash" "secret"}
    #{"session" "sessions" "auth" "oauth" "credential" "credentials" "token" "tokens" "key" "keys" "secret" "secrets"}
    :SEC_KEY]
   [#{"notes" "comments" "remarks" "condition" "conditions" "treatment" "treatments" "procedure" "procedures"
      "result" "results" "history" "record" "records"}
    #{"patient" "patients" "medical" "clinical" "health" "hospital" "encounter" "encounters" "diagnosis"
      "prescription" "prescriptions"}
    :PHI]
   [#{"template" "templates" "sample" "samples" "scan" "scans" "data" "vector" "embedding"}
    #{"biometric" "biometrics" "fingerprint" "fingerprints" "facial" "voice" "iris" "retina" "dna" "genetic"
      "genomic" "genome"}
    :BIO_GEN]
   [#{"number" "num" "no" "expiry" "expiration" "exp" "last4" "holder"}
    #{"card" "cards" "credit" "bank"}
    :PCI_FIN]
   [#{"name" "address" "age" "street" "lat" "lon" "lng" "latitude" "longitude" "zipcode" "postcode"}
    #{"user" "users" "person" "people" "customer" "customers" "employee" "employees" "member" "members" "contact"
      "contacts" "patient" "patients" "profile" "profiles" "subscriber" "subscribers" "lead" "leads" "applicant"
      "applicants" "student" "students" "candidate" "candidates"}
    :PII]
   [#{"amount" "value" "total"}
    #{"salary" "salaries" "payroll" "compensation" "deal" "deals" "contract" "contracts" "forecast" "forecasts"
      "budget" "budgets"}
    :BIZ_CONF]])

(def ^:private categories
  (set lib.schema.metadata/column-data-sensitivity-types))

(def ^:private precedence
  (zipmap lib.schema.metadata/column-data-sensitivity-types (range)))

(when-not config/is-prod?
  (let [valid-category?    #(and (contains? categories %) (not= :PUBLIC %))
        valid-base-types?  #(and (set? %) (seq %) (every? (fn [t] (isa? t :type/*)) %))
        valid-token?       #(re-matches #"[a-z0-9]+(?:_[a-z0-9]+)?" %)]
    (doseq [[tokens base-types category] token-rules]
      (assert (and (set? tokens) (every? valid-token? tokens)) (pr-str tokens))
      (assert (valid-base-types? base-types) (pr-str base-types))
      (assert (valid-category? category) (pr-str category)))
    (doseq [[pattern base-types category] stem-rules]
      (assert (instance? java.util.regex.Pattern pattern) (pr-str pattern))
      (assert (valid-base-types? base-types) (pr-str base-types))
      (assert (valid-category? category) (pr-str category)))
    (doseq [[semantic-type category] (concat semantic-type->category user-table-semantic-type->category)]
      (assert (isa? semantic-type :Semantic/*) (pr-str semantic-type))
      (assert (valid-category? category) (pr-str category)))
    (doseq [[field-tokens table-tokens category] table-boosters]
      (assert (every? valid-token? field-tokens) (pr-str field-tokens))
      (assert (every? valid-token? table-tokens) (pr-str table-tokens))
      (assert (valid-category? category) (pr-str category)))))

(defn- base-type-matches? [base-type base-types]
  (some (partial isa? base-type) base-types))

(defn- token-matches [{:keys [tokens pairs]} base-type]
  (let [names (into tokens pairs)]
    (for [[rule-names base-types category] token-rules
          :when (and (some rule-names names)
                     (base-type-matches? base-type base-types))]
      category)))

(defn- stem-matches [lower-name base-type]
  (for [[pattern base-types category] stem-rules
        :when (and (base-type-matches? base-type base-types)
                   (re-find pattern lower-name))]
    category))

(defn- semantic-matches [semantic-type entity-type]
  (when semantic-type
    (for [[st category] (cond-> semantic-type->category
                          (= :entity/UserTable entity-type) (merge user-table-semantic-type->category))
          :when (isa? semantic-type st)]
      category)))

(defn- fingerprint-matches [fingerprint base-type]
  (when (and (isa? base-type :type/Text)
             (>= (get-in fingerprint [:type :type/Text :percent-email] 0) 0.95))
    [:PII]))

(defn- booster-matches [{:keys [tokens]} table-name]
  (when table-name
    (let [table-tokens (:tokens (name->tokens table-name))]
      (for [[field-tokens rule-table-tokens category] table-boosters
            :when (and (some field-tokens tokens)
                       (some rule-table-tokens table-tokens))]
        category))))

(def ^:private Field
  [:map
   [:name          :string]
   [:base_type     :keyword]
   [:semantic_type {:optional true} [:maybe :keyword]]
   [:fingerprint   {:optional true} :any]])

(def ^:private TableContext
  [:maybe
   [:map
    [:name        {:optional true} [:maybe :string]]
    [:entity_type {:optional true} [:maybe :keyword]]]])

(mu/defn infer-data-sensitivity :- [:maybe ::lib.schema.metadata/column.data-sensitivity]
  "Infer the `data_sensitivity` category of `field` from its name, base type, semantic type, and fingerprint, with
  `table-context` (`:name`, `:entity_type` of its Table) gating the weaker rules. Returns the highest-precedence
  matching category, or nil when no rule matches. Never returns `:PUBLIC`."
  [{field-name :name, :keys [base_type semantic_type fingerprint]} :- Field
   {table-name :name, :keys [entity_type]} :- TableContext]
  (let [tokens (name->tokens field-name)]
    (->> (concat (token-matches tokens base_type)
                 (stem-matches (u/lower-case-en field-name) base_type)
                 (semantic-matches semantic_type entity_type)
                 (fingerprint-matches fingerprint base_type)
                 (booster-matches tokens table-name))
         (sort-by precedence)
         first)))

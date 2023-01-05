(ns metabase.util.schema-test
  "Tests for utility schemas and various API helper functions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.core :refer [POST]]
   [malli.core :as mc]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]))

(deftest ^:parallel generate-api-error-message-test
  (testing "check that the API error message generation is working as intended"
    (is (= (str "value may be nil, or if non-nil, value must satisfy one of the following requirements: "
                "1) value must be a boolean. "
                "2) value must be a valid boolean string ('true' or 'false').")
           (str (su/api-error-message (s/maybe (s/cond-pre s/Bool su/BooleanStringPlumatic))))))
    (is (= (str/join "\n"
                     ["value must be a map with schema: ("
                      "  a : value must be a map with schema: ("
                      "    b : value must be a map with schema: ("
                      "      c : value must be a map with schema: ("
                      "        d : value must be a map with schema: ("
                      "          optional-key (optional) : value must be an integer."
                      "          key : value may be nil, or if non-nil, value must be a boolean."
                      "        )"
                      "      )"
                      "    )"
                      "  )"
                      ")"])
           (str (su/api-error-message
                 {:a {:b {:c {:d {:key                           (s/maybe s/Bool)
                                  (s/optional-key :optional-key) s/Int}}}}}))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/:id/dimension"
  "Sets the dimension for the given object with ID."
  #_{:clj-kondo/ignore [:unused-binding :deprecated-var]}
  [id :as {{dimension-type :type, dimension-name :name} :body}]
  {dimension-type (su/api-param "type" (s/enum "internal" "external"))
   dimension-name su/NonBlankStringPlumatic})

(deftest ^:parallel api-param-test
  (testing "check that API error message respects `api-param` when specified"
    (is (= (str/join "\n"
                     ["## `POST metabase.util.schema-test/:id/dimension`"
                      ""
                      "Sets the dimension for the given object with ID."
                      ""
                      "### PARAMS:"
                      ""
                      "*  **`id`** "
                      ""
                      "*  **`type`** value must be one of: `external`, `internal`."
                      ""
                      "*  **`dimension-name`** value must be a non-blank string."])
           (:doc (meta #_{:clj-kondo/ignore [:unresolved-symbol]} #'POST_:id_dimension))))))

(defn- ex-info-msg [f]
  (try
    (f)
    (catch clojure.lang.ExceptionInfo e
      (.getMessage e))))

(deftest translate-exception-message-test
  (mt/with-mock-i18n-bundles {"zz" {:messages {"Integer greater than zero" "INTEGER GREATER THAN ZERO"}}}
    (is (re= #".*Integer greater than zero.*"
             (ex-info-msg #(s/validate su/IntGreaterThanZeroPlumatic -1))))
    (mt/with-user-locale "zz"
      (is (re= #".*INTEGER GREATER THAN ZERO.*"
               (ex-info-msg #(s/validate su/IntGreaterThanZeroPlumatic -1)))))))

(deftest ^:parallel distinct-test
  (is (= nil
         (s/check (su/distinct [s/Int]) [])))
  (is (= nil
         (s/check (su/distinct [s/Int]) [1])))
  (is (= nil
         (s/check (su/distinct [s/Int]) [1 2])))
  (is (some? (s/check (su/distinct [s/Int]) [1 2 1]))))

(deftest ^:parallel open-schema-test
  (let [value  {:thing     3
                :extra-key 5
                :sub       {:key 3 :another-extra 5}}
        schema {(s/optional-key :thing) s/Int
                (s/optional-key :sub)   {(s/optional-key :key) s/Int}}]
    (is (= {:sub {:another-extra 'disallowed-key}, :extra-key 'disallowed-key}
           (s/check schema value)))
    (is (nil? (s/check (su/open-schema schema) value))))
  (testing "handles if there are already s/Any's"
    (let [value  {:thing     3
                  :extra-key 5
                  :sub       {:key 3 :another-extra 5}}
          schema {(s/optional-key :thing) s/Int
                  (s/optional-key :sub)   {(s/optional-key :key) s/Int
                                           s/Any                 s/Any}
                  s/Any                   s/Any}]
      (is (nil? (s/check (su/open-schema schema) value)))))
  (testing "handles if there are already s/Any's or s/Keyword's"
    (let [value  {:thing     3
                  :extra-key 5
                  :sub       {:key 3 :another-extra 5}}
          schema {(s/optional-key :thing) s/Int
                  (s/optional-key :sub)   {(s/optional-key :key) s/Int
                                           s/Keyword             s/Any}
                  s/Any                   s/Any}]
      (is (nil? (s/check (su/open-schema schema) value)))))
  (testing "still validates the spec-ed entries"
    (let [value  {:thing     3.0
                  :extra-key 5
                  :sub       {:key 3 :another-extra 5}}
          schema {(s/optional-key :thing) s/Int
                  (s/optional-key :sub)   {(s/optional-key :key) s/Int}}]
      (is (contains? (s/check (su/open-schema schema) value)
                     :thing))))
  (testing "if it contains a generic open entry, it is replaced with an s/Any"
    (doseq [validator [s/Keyword s/Symbol s/Str s/Int]]
      (let [value  {:thing 3}
            schema {(s/optional-key :thing) s/Int
                    validator               s/Any}]
        (is (nil? (s/check (su/open-schema schema) (assoc value :random-thing :whatever))))))))

(defn- plumatic-validate
  [schema x]
  (boolean (u/ignore-exceptions
             (s/validate schema x))))

(defn- malli-validate
  [schema x]
  (boolean (u/ignore-exceptions
             (mc/validate schema x))))

(deftest malli-and-plumatic-compatibility
  (doseq [{:keys [plumatic malli failed-cases success-cases]}
          [{:plumatic      su/NonBlankStringPlumatic
            :malli         su/NonBlankString
            :failed-cases  ["" 1]
            :success-cases ["a thing"]}
           {:plumatic      su/IntGreaterThanOrEqualToZeroPlumatic
            :malli         su/IntGreaterThanOrEqualToZero
            :failed-cases  ["1" -1 1.5]
            :success-cases [0 1]}
           {:plumatic      su/IntGreaterThanZeroPlumatic
            :malli         su/IntGreaterThanZero
            :failed-cases  ["1" 0 1.5]
            :success-cases [1 2]}
           {:plumatic      su/PositiveNumPlumatic
            :malli         su/PositiveNum
            :failed-cases  [0 "1"]
            :success-cases [1.5 2]}
           {:plumatic      su/KeywordOrStringPlumatic
            :malli         su/KeywordOrString
            :failed-cases  [1 [1] {:a 1}]
            :success-cases [:a "a"]}
           {:plumatic      su/FieldTypePlumatic
            :malli         su/FieldType
            :failed-cases  [:type/invalid :Semantic/*]
            :success-cases [:type/Float]}
           {:plumatic      su/FieldSemanticTypePlumatic
            :malli         su/FieldSemanticType
            :failed-cases  [:Semantic/invalid :type/Float]
            :success-cases [:type/Category]}
           {:plumatic      su/FieldRelationTypePlumatic
            :malli         su/FieldRelationType
            :failed-cases  [:Relation/invalid :type/Category :type/Float]
            :success-cases [:type/FK]}
           {:plumatic      su/FieldSemanticOrRelationTypePlumatic
            :malli         su/FieldSemanticOrRelationType
            :failed-cases  [:Relation/invalid :type/Float]
            :success-cases [:type/FK :type/Category]}
           {:plumatic      su/CoercionStrategyPlumatic
            :malli         su/CoercionStrategy
            :failed-cases  [:type/Category :type/Float]
            :success-cases [:Coercion/ISO8601->Date]}
           {:plumatic      su/FieldTypeKeywordOrStringPlumatic
            :malli         su/FieldTypeKeywordOrString
            :failed-cases  [1 :type/FK]
            :success-cases [:type/Float "type/Float"]}
           {:plumatic      su/FieldSemanticTypeKeywordOrStringPlumatic
            :malli         su/FieldSemanticTypeKeywordOrString
            :failed-cases  [1 :type/FK]
            :success-cases [:type/Category "type/Category"]}
           {:plumatic      su/FieldPlumatic
            :malli         su/Field
            :failed-cases  [[:aggregation 0] [:field "name" {}]]
            :success-cases [[:field 3 nil] ["field" "name" {:base-type :type/Float}]]}
           {:plumatic      su/MapPlumatic
            :malli         su/Map
            :failed-cases  [[] 1 "a"]
            :success-cases [{} {:a :b}]}
           {:plumatic      su/EmailPlumatic
            :malli         su/Email
            :failed-cases  ["abc.com" 1]
            :success-cases ["ngoc@metabase.com"]}
           {:plumatic      su/ValidPasswordPlumatic
            :malli         su/ValidPassword
            :failed-cases  ["abc.com" 1 "PASSW0RD"]
            :success-cases ["unc0mmonpw"]}
           {:plumatic      su/IntStringPlumatic
            :malli         su/IntString
            :failed-cases  [:a "a" "1.5"]
            :success-cases ["1"]}
           {:plumatic      su/BooleanStringPlumatic
            :malli         su/BooleanString
            :failed-cases  [:false :true true "f"]
            :success-cases ["true" "false"]}
           {:plumatic      su/TemporalStringPlumatic
            :malli         su/TemporalString
            :failed-cases  ["random string"]
            :success-cases ["2019-10-28T13:14:15" "2019-10-28"]}
           {:plumatic      su/JSONStringPlumatic
            :malli         su/JSONString
            :failed-cases  ["string"]
            :success-cases ["{\"a\": 1}"]}
           {:plumatic      su/EmbeddingParamsPlumatic
            :malli         su/EmbeddingParams
            :failed-cases  [{:key "value"}]
            :success-cases [{:key "disabled"}]}
           {:plumatic      su/ValidLocalePlumatic
            :malli         su/ValidLocale
            :failed-cases  ["locale"]
            :success-cases ["en" "es"]}
           {:plumatic      su/NanoIdStringPlumatic
            :malli         su/NanoIdString
            :failed-cases  ["random"]
            :success-cases ["FReCLx5hSWTBU7kjCWfuu"]}
           {:plumatic      su/ParameterPlumatic
            :malli         su/Parameter
            :failed-cases  [{:id   "param-id"
                             :name "param-name"}
                            {:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "invalid-type"
                             :values_source_config {:values [[1 2 3]]}}
                            {:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "card"
                             :values_source_config {:card_id     3
                                                    :value_field [:aggregation 0]}}]
            :success-cases [{:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "card"
                             :values_source_config {:card_id     3
                                                    :value_field [:field 3 nil]
                                                    :label_field [:field "name" {:base-type :type/Float}]}}
                            {:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "static-list"
                             :values_source_config {:values [[1 2 3]]}}]}
           {:plumatic      su/ParameterMappingPlumatic
            :malli         su/ParameterMapping
            :failed-cases  [{:parameter_id "param-id"}
                            {:parameter_id "param-id"
                             :target        [:field 3 nil]
                             :card_id       "a"}]
            :success-cases [{:parameter_id "param-id"
                             :target        [:field 3 nil]
                             :card_id       3}]}]]

    (doseq [case failed-cases]
      (testing (format "case: %s should fail" (pr-str case))
        (testing (format "with malli Schema: %s" (pr-str malli))
          (is (false? (malli-validate malli case))))
        (testing (format "with Plumatic Schema: %s" (pr-str plumatic))
         (is (false? (plumatic-validate plumatic case))))))

    (doseq [case success-cases]
      (testing (format "case: %s should success" (pr-str case))
        (testing (format "with malli Schema: %s" (pr-str malli))
          (is (true? (malli-validate malli case))))
        (testing (format "with Plumatic Schema: %s"  (pr-str plumatic))
         (is (true? (plumatic-validate plumatic case))))))))

(ns metabase.util.schema-test
  "Tests for utility schemas and various API helper functions."
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.test :as mt]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(deftest ^:parallel generate-api-error-message-test
  (testing "check that the API error message generation is working as intended"
    (is (= (str "value may be nil, or if non-nil, value must satisfy one of the following requirements: "
                "1) value must be a boolean. "
                "2) value must be a valid boolean string ('true' or 'false').")
           (str (su/api-error-message (s/maybe (s/cond-pre s/Bool su/BooleanString))))))
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

(api/defendpoint POST "/:id/dimension"
  "Sets the dimension for the given object with ID."
  #_{:clj-kondo/ignore [:unused-binding]}
  [id :as {{dimension-type :type, dimension-name :name} :body}]
  {dimension-type (su/api-param "type" (s/enum "internal" "external"))
   dimension-name su/NonBlankString})

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
             (ex-info-msg #(s/validate su/IntGreaterThanZero -1))))
    (mt/with-user-locale "zz"
      (is (re= #".*INTEGER GREATER THAN ZERO.*"
               (ex-info-msg #(s/validate su/IntGreaterThanZero -1)))))))

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

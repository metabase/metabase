(ns metabase.lib.schema.expression.conditional-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.conditional :as expression.conditional]
   [metabase.lib.test-metadata :as meta]
   [metabase.test-runner.assert-exprs.malli-equals]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(comment metabase.test-runner.assert-exprs.malli-equals/keep-me)

(deftest ^:parallel best-return-type-test
  (is (= ::expression/type.unknown
         (#'expression.conditional/best-return-type :type/Integer ::expression/type.unknown))))

(mu/defn- case-expr :- :mbql.clause/case
  [& args]
  [:case
   {:lib/uuid (str (random-uuid))}
   (mapv (fn [arg]
           [[:= {:lib/uuid (str (random-uuid))} 1 1]
            arg])
         args)])

(mu/defn- value-expr :- :mbql.clause/value
  [effective-type x]
  [:value {:lib/uuid       (str (random-uuid))
           :effective-type effective-type
           :base-type      effective-type}
   x])

(deftest ^:parallel case-schema-valid-test
  (testing "schema validation for valid :case expressions"
    (are [args] (true?
                 (mr/validate :mbql.clause/case
                              (into [:case {:lib/uuid (str (random-uuid))}] args)))
      [[[true 1]] 1]
      [[[true false]] false]
      [[[true true]] true]
      [[[true true]] true])))

(deftest ^:parallel case-schema-invalid-test
  (testing "schema validation for invalid :case expressions"
    (are [args] (false?
                 (mr/validate :mbql.clause/case
                              (into [:case {:lib/uuid (str (random-uuid))}] args)))
      [1]
      [[] 1])))

(deftest ^:parallel case-type-of-test
  (testing "type-of logic for :case expressions"
    ;; In QP and MLv2: `expression/type-of-method :case`
    (are [expr expected] (= expected
                            (expression/type-of expr))

      (case-expr 1 1)
      :type/Integer

      (case-expr "2023-03-08")
      #{:type/Text :type/Date}

      (case-expr "2023-03-08" "2023-03-08")
      #{:type/Text :type/Date}

      (case-expr "2023-03-08" "abc")
      :type/Text

      (case-expr "2023-03-08" "05:13")
      :type/Text

      (case-expr "2023-03-08T06:15-07:00" [:field {:lib/uuid (str (random-uuid)), :base-type :type/DateTimeWithLocalTZ} 1])
      :type/DateTimeWithLocalTZ

      ;; This may also be broken now.
      (case-expr "2023-03-08T06:15" [:field {:lib/uuid (str (random-uuid)), :base-type :type/DateTimeWithLocalTZ} 1])
      :type/DateTimeWithLocalTZ

      ;; also broken because `:type/Float` is not the most common ancestor of `:type/Integer` and `:type/Float`.
      (case-expr 1 1.1)
      :type/Float

      ;; 'pretend' that this returns `:type/DateTime` when it actually returns `:type/HasDate` --
      ;; see [[metabase.lib.schema.expression.conditional/case-coalesce-return-type]]
      (case-expr (value-expr :type/DateTimeWithTZ "2023-03-08T00:00:00Z")
                 (value-expr :type/Date "2023-03-08"))
      :type/DateTime)))

(deftest ^:parallel coalesce-schema-valid-test
  (testing "schema validation for valid :coalesce expressions"
    (are [args] (true?
                 (mr/validate :mbql.clause/coalesce
                              (into [:coalesce {:lib/uuid (str (random-uuid))}] args)))
      [1 2]
      [1 2 3]
      [1 [:field {:lib/uuid (str (random-uuid)) :base-type :type/Integer} 1]]
      ; TODO: this case should fail due to Time and Date not being compatible,
      ; but until we have a better way to handle this, we just allow it and document
      ; here as a test.
      [(value-expr :type/Date "2023-03-08")
       (value-expr :type/Time "15:03:55")])))

(deftest ^:parallel coalesce-test
  (is (mr/validate
       :mbql.clause/coalesce
       [:coalesce
        {:lib/uuid "eb39757b-a403-46c7-a1b0-353f21812a87"}
        [:field {:base-type :type/Text, :lib/uuid "780aab5a-88ec-4aa6-8a4a-274702273c7a"} (meta/id :venues :name)]
        "bar"]))
  (is (mr/validate
       ::lib.schema/query
       {:lib/type     :mbql/query
        :lib/metadata meta/metadata-provider
        :database     (meta/id)
        :stages       [{:lib/type     :mbql.stage/mbql,
                        :source-table (meta/id :venues)
                        :expressions  [[:coalesce
                                        {:lib/uuid "455a9f5e-4996-4df9-82aa-01bc083b2efe"
                                         :lib/expression-name "expr"}
                                        [:field
                                         {:base-type :type/Text, :lib/uuid "68443c43-f9de-45e3-9f30-8dfd5fef5af6"}
                                         (meta/id :venues :name)]
                                        "bar"]]}]})))

(mu/defn- coalesce-expr :- :mbql.clause/coalesce
  [not-nil-expr nil-expr]
  [:coalesce
   {:lib/uuid (str (random-uuid))}
   not-nil-expr
   nil-expr])

(deftest ^:parallel coalesce-type-of-test
  (testing "type-of logic for :coalesce expressions"
    ;; In QP and MLv2: `expression/type-of-method :case`
    (are [expr expected] (= expected
                            (expression/type-of expr))

      (coalesce-expr 1 1)
      :type/Integer

      ;; 'pretend' that this returns `:type/DateTime` when it actually returns `:type/HasDate` --
      ;; see [[metabase.lib.schema.expression.conditional/case-coalesce-return-type]]
      (coalesce-expr (value-expr :type/DateTimeWithTZ "2023-03-08T00:00:00Z")
                     (value-expr :type/Date "2023-03-08"))
      :type/DateTime)))

(deftest ^:parallel case-type-of-with-fields-only-test
  ;; Ideally expression/type-of should have enough information to determine the types of fields.
  (testing "The type of a case expression can be determined even if it consists of fields only."
    (doseq [[message expr] {"no default"
                            [:case
                             {:lib/uuid "8c6e099e-b856-4aeb-a8f6-2266b5d3d1e3"}
                             [[[:>
                                {:lib/uuid "9c4cc3b0-f3c7-4d34-ab53-640ba6e911e5"}
                                [:field {:lib/uuid "435b08c8-9404-41a5-8c5a-00b415f14da6", :effective-type :type/Float}
                                 25]
                                0]
                               [:field {:lib/uuid "1c93ba8b-6a39-4ef2-a9e6-e3bcff042800"} 32]]]]

                            "with default :field"
                            [:case
                             {:lib/uuid "8c6e099e-b856-4aeb-a8f6-2266b5d3d1e3"}
                             [[[:>
                                {:lib/uuid "9c4cc3b0-f3c7-4d34-ab53-640ba6e911e5"}
                                [:field {:lib/uuid "435b08c8-9404-41a5-8c5a-00b415f14da6", :effective-type :type/Float}
                                 25]
                                0]
                               [:field {:lib/uuid "1c93ba8b-6a39-4ef2-a9e6-e3bcff042800"} 32]]]
                             [:field
                              {:source-field 29
                               :lib/uuid     "a5ab7f91-9826-40a7-9499-4a1a0184a450"}
                              23]]

                            "with default integer literal"
                            [:case
                             {:lib/uuid "66101767-c429-4499-b1b3-512e58267ea4"}
                             [[[:<
                                {:lib/uuid "580d9de8-8ade-4d64-a512-1e43a31fe869"}
                                [:field {:lib/uuid "347d5337-5da8-47ff-bc05-b11154e8d19c", :effective-type :type/Float}
                                 139657]
                                2]
                               [:field {:lib/uuid "a9f83548-d590-4dec-b7dd-ad2bbd0bbe9d"} 139657]]]
                             0]}]
      (testing (str message \newline (u/pprint-to-str expr))
        (is (malli= :mbql.clause/case expr))
        (is (= ::expression/type.unknown
               (expression/type-of expr)))
        (testing "type.unknown expressions should be allowed to be considered numeric expressions"
          (is (malli= ::expression/number expr)))))))

(deftest ^:parallel coalasce-type-of-with-fields-only-test
  ;; Ideally expression/type-of should have enough information to determine the types of fields.
  (testing "The type of a coalesce expression can be determined even if it consists of fields only."
    (is (= ::expression/type.unknown
           (expression/type-of
            [:coalesce
             {:lib/uuid "8c6e099e-b856-4aeb-a8f6-2266b5d3d1e3"}
             [:field {:lib/uuid "435b08c8-9404-41a5-8c5a-00b415f14da6"} 25]
             [:field
              {:source-field 29
               :lib/uuid "a5ab7f91-9826-40a7-9499-4a1a0184a450"}
              23]])))))

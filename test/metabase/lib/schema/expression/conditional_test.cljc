(ns metabase.lib.schema.expression.conditional-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.conditional :as expression.conditional]
   [metabase.lib.test-metadata :as meta]
   [metabase.test-runner.assert-exprs.malli-equals]
   [metabase.util :as u]))

(comment metabase.test-runner.assert-exprs.malli-equals/keep-me)

(deftest ^:parallel best-return-type-test
  (is (= ::expression/type.unknown
         (#'expression.conditional/best-return-type :type/Integer ::expression/type.unknown))))

(defn- case-expr [& args]
  (let [clause [:case
                {:lib/uuid (str (random-uuid))}
                (mapv (fn [arg]
                        [[:= {:lib/uuid (str (random-uuid))} 1 1]
                         arg])
                      args)]]
    (is (mc/validate :mbql.clause/case clause))
    clause))

(deftest ^:parallel case-type-of-test
  (are [expr expected] (= expected
                          (expression/type-of expr))
    ;; easy, no ambiguity
    (case-expr 1 1)
    :type/Integer

    ;; Ambiguous literal types
    (case-expr "2023-03-08")
    #{:type/Text :type/Date}

    (case-expr "2023-03-08" "2023-03-08")
    #{:type/Text :type/Date}

    ;; Ambiguous literal types mixed with unambiguous types
    (case-expr "2023-03-08" "abc")
    :type/Text

    ;; Literal types that are ambiguous in different ways! `:type/Text` is the only common type between them!
    (case-expr "2023-03-08" "05:13")
    :type/Text

    ;; Confusion! The "2023-03-08T06:15" is #{:type/String :type/DateTime}, which is less specific than
    ;; `:type/DateTimeWithLocalTZ`. Technically this should return `:type/DateTime`, since it's the most-specific
    ;; common ancestor type compatible with all args! But calculating that stuff is way too hard! So this will have to
    ;; do for now! -- Cam
    (case-expr "2023-03-08T06:15" [:field {:lib/uuid (str (random-uuid)), :base-type :type/DateTimeWithLocalTZ} 1])
    :type/DateTimeWithLocalTZ

    ;; Differing types with a common base type that is more specific than `:type/*`
    (case-expr 1 1.1)
    :type/Float))

(deftest ^:parallel coalesce-test
  (is (mc/validate
       :mbql.clause/coalesce
       [:coalesce
        {:lib/uuid "eb39757b-a403-46c7-a1b0-353f21812a87"}
        [:field {:base-type :type/Text, :lib/uuid "780aab5a-88ec-4aa6-8a4a-274702273c7a"} (meta/id :venues :name)]
        "bar"]))
  (is (mc/validate
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
  (testing "The type of a case expression can be determined even if it consists of fields only."
    (is (= ::expression/type.unknown
           (expression/type-of
            [:coalesce
             {:lib/uuid "8c6e099e-b856-4aeb-a8f6-2266b5d3d1e3"}
             [:field {:lib/uuid "435b08c8-9404-41a5-8c5a-00b415f14da6"} 25]
             [:field
              {:source-field 29
               :lib/uuid "a5ab7f91-9826-40a7-9499-4a1a0184a450"}
              23]])))))

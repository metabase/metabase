(ns metabase.lib.schema.expression.conditional-test
  (:require
   [clojure.test :refer [are deftest is]]
   [malli.core :as mc]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.test-metadata :as meta]))

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
    :type/Number))

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
                        :expressions  {"expr"
                                       [:coalesce
                                        {:lib/uuid "455a9f5e-4996-4df9-82aa-01bc083b2efe"}
                                        [:field
                                         {:base-type :type/Text, :lib/uuid "68443c43-f9de-45e3-9f30-8dfd5fef5af6"}
                                         (meta/id :venues :name)]
                                        "bar"]}}]})))

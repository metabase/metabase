(ns metabase.lib.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.generators :as gen]
   [clojure.walk :as walk]
   [com.gfredericks.test.chuck.clojure-test :as chuck.test :refer [checking]]
   [malli.generator :as mg]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.filter :as schema.filter]
   [metabase.lib.test-metadata :as meta]
   [metabase.mbql.util :as mbql.u])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel equals-test
  (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        categories-id-metadata      (lib.metadata/stage-column q2 -1 "ID")]
    (testing "without query/stage-number, return a function for later resolution"
      (let [f (lib/= venues-category-id-metadata categories-id-metadata)]
        (is (fn? f))
        (is (=? [:=
                 {:lib/uuid uuid?}
                 [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
                 [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
                (f {:lib/metadata meta/metadata} -1)))))
    (testing "with query/stage-number, return clause right away"
      (is (=? [:=
               {:lib/uuid uuid?}
               [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
               [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
              (lib/= {:lib/metadata meta/metadata}
                     -1
                     venues-category-id-metadata
                     categories-id-metadata))))))

(defn- field-metadata-gen
  [[_ id-or-name]]
  (if (integer? id-or-name)
    (gen/let [[table fields] (gen/elements (for [table (:tables meta/metadata)]
                                             [(:name table) (map :name (:fields table))]))
              field (gen/elements fields)]
      (-> (lib/query meta/metadata table)
          (lib.metadata/field-metadata table field)))
    (gen/let [field (gen/elements (map :name (:columns meta/results-metadata)))]
      (-> (lib/saved-question-query meta/saved-question)
          (lib.metadata/field-metadata field)))))

(def ^:private filter-expr-gen
  (gen/let [filter-shape (gen/such-that #(-> % first (= :field) not)
                                        (mg/generator ::schema.filter/filter))
            fields (gen/return (set (mbql.u/match filter-shape #{:field :field/unresolved})))
            field->metadata (gen/return (zipmap fields
                                                (map #(-> % field-metadata-gen gen/generate)
                                                     fields)))]
    (walk/postwalk (fn [form]
                     (if-let [metadata (field->metadata form)]
                       metadata
                       form))
                   filter-shape)))

(comment
  (gen/generate (field-metadata-gen ["field" 3]))
  (gen/sample filter-expr-gen)
  nil)

(deftest ^:parallel filter-creation
  (checking "filters can be created"
    [filter-expr filter-expr-gen]
    (let [[op _options & args] filter-expr
          f (resolve (symbol (namespace ::lib/x) (name op)))]
      (is (some? f))
      (when f
        (is (fn? (deref f)))
        (is (some? (apply f {:lib/metadata meta/metadata} -1 args)))))))

(deftest ^:parallel filter-test
  (let [q1                          (lib/query meta/metadata "CATEGORIES")
        q2                          (lib/saved-question-query meta/saved-question)
        venues-category-id-metadata (lib.metadata/field-metadata q1 "VENUES" "CATEGORY_ID")
        categories-id-metadata      (lib.metadata/field-metadata q2 "ID")]
    (testing "without query/stage-number, return a function for later resolution"
      (let [f (lib/->= venues-category-id-metadata categories-id-metadata)]
        (is (fn? f))
        (is (=? [:=
                 {:lib/uuid uuid?}
                 [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
                 [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
                (f {:lib/metadata meta/metadata} -1)))))
    (testing "with query/stage-number, return clause right away"
      (is (=? [:=
               {:lib/uuid uuid?}
               [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
               [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
              (lib/= {:lib/metadata meta/metadata}
                     -1
                     venues-category-id-metadata
                     categories-id-metadata))))))

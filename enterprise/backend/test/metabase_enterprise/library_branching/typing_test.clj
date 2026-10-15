(ns metabase-enterprise.library-branching.typing-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.golden :as golden]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.typing :as typing]))

(set! *warn-on-reflection* true)

(def ^:private db "Sample Database")
(def ^:private orders [db "PUBLIC" "ORDERS"])
(def ^:private people [db "PUBLIC" "PEOPLE"])
(def ^:private total (conj orders "TOTAL"))
(def ^:private created-at (conj orders "CREATED_AT"))
(def ^:private person-name (conj people "NAME"))

(def ^:private segment-id "lArGeOrDeRsSeGmEnT001")
(def ^:private measure-id "oRdErToTaLmEaSuRe0001")

(defn- golden-snapshot []
  (:snapshot (check/check (golden/tree) {})))

(def ^:private env
  (:env (manifest/decode (golden/manifest-bytes))))

(defn- with-field-type
  "`env` with the field `k` of the type `t`."
  [env k t]
  (assoc env k {:object :field :base-type t :effective-type t}))

(defn- field [k t]
  ["field" {:base-type t} k])

(defn- query
  "A portable query on ORDERS with the stages `stages`; the first stage gets its source table."
  [& stages]
  {:lib/type "mbql/query"
   :database db
   :stages   (vec (map-indexed (fn [i stage]
                                 (cond-> (assoc stage :lib/type "mbql.stage/mbql")
                                   (zero? i) (assoc :source-table orders)))
                               stages))})

(defn- question
  "A question item with the query `q`, in the Revenue collection."
  [q]
  {:kind  :question
   :name  "Question"
   :place golden/revenue-id
   :refs  (kinds/refs :question "QuestionUnderTest0001" {:display "table" :query q})
   :attrs {:display "table" :query q}})

(def ^:private question-id "QuestionUnderTest0001")

(defn- findings-of [s env]
  (into {} (map (juxt :id identity)) (typing/validate s env)))

(deftest ^:parallel golden-repository-is-well-typed-test
  (testing "every query of the golden repository fits the types of the golden manifest"
    (is (= [] (typing/validate (golden-snapshot) env)))))

(deftest ^:parallel the-manifest-gives-the-types-test
  (testing "the manifest says that ORDERS.TOTAL is text: each query that uses it as a number is a finding, also where
           the query's own reference says type/Float"
    (let [found (findings-of (golden-snapshot) (with-field-type env total "type/Text"))]
      (is (= #{golden/total-revenue-id segment-id measure-id} (set (keys found))))
      (is (= {:rule   :query-typed
              :id     golden/total-revenue-id
              :attr   :query
              :errors [{:at [:stages 0 :aggregation 0 2] :message "an expression returning a number"}]}
             (get found golden/total-revenue-id)))
      (is (= {:rule   :query-typed
              :id     segment-id
              :attr   :definition
              :errors [{:at [:stages 0 :filters 0] :message "arguments should be comparable"}]}
             (get found segment-id)))
      (is (= :definition (:attr (get found measure-id))))))
  (testing "a coercion in the manifest: an effective type that is a number keeps the sum well typed"
    (is (= [] (typing/validate (golden-snapshot)
                               (assoc env total {:object :field :base-type "type/Text" :effective-type "type/Float"}))))))

(deftest ^:parallel a-field-of-the-wrong-type-is-a-finding-test
  (let [s (golden-snapshot)]
    (testing "a sum of a text field"
      (is (= [{:rule   :query-typed
               :id     question-id
               :attr   :query
               :errors [{:at [:stages 0 :aggregation 0 2] :message "an expression returning a number"}]}]
             (typing/validate (assoc s question-id (question (query {:aggregation [["sum" {} (field person-name "type/Text")]]})))
                              env))))
    (testing "a text filter on a number field"
      (is (= [{:rule   :query-typed
               :id     question-id
               :attr   :query
               :errors [{:at [:stages 0 :filters 0 2] :message "an expression returning a string"}]}]
             (typing/validate (assoc s question-id (question (query {:filters [["contains" {} (field total "type/Float") "x"]]})))
                              env))))
    (testing "a temporal filter on a date field is well typed"
      (is (= [] (typing/validate (assoc s question-id
                                        (question (query {:filters [["time-interval" {} (field created-at "type/DateTime")
                                                                     -30 "day"]]})))
                                 env))))))

(deftest ^:parallel a-later-stage-has-the-types-of-the-stage-before-test
  (let [s  (golden-snapshot)
        q  (fn [ref-type]
             (question (query {:aggregation [["sum" {} (field total "type/Float")]]}
                              {:filters [["contains" {} ["field" {:base-type ref-type} "sum"] "x"]]})))]
    (testing "the column sum of the first stage is a number, whatever the reference of the second stage says"
      (is (= [{:rule   :query-typed
               :id     question-id
               :attr   :query
               :errors [{:at [:stages 1 :filters 0 2] :message "an expression returning a string"}]}]
             (typing/validate (assoc s question-id (q "type/Text")) env))))
    (testing "a reference to a column that the stage before does not return keeps its own type"
      (is (= [] (typing/validate (assoc s question-id
                                        (question (query {:aggregation [["sum" {} (field total "type/Float")]]}
                                                         {:filters [["contains" {} ["field" {:base-type "type/Text"} "other"]
                                                                     "x"]]})))
                                 env))))))

(deftest ^:parallel unresolved-references-are-not-typed-test
  (let [s (assoc (golden-snapshot) question-id (question (query {:aggregation [["sum" {} (field person-name "type/Text")]]})))]
    (testing "a query that names a field that the manifest does not have: the semantic check reports it, the typing
             does not"
      (is (= [] (typing/validate s (dissoc env person-name))))
      (is (= [{:rule :env-resolves :id question-id :ref [:field [:env person-name]]}]
             (typing/semantic s (dissoc env person-name)))))
    (testing "a query of a database that the manifest does not have"
      (is (= [] (typing/validate s {})))))
  (testing "a query whose shape Lib's query schema refuses, with no regard to types: no typing finding"
    (let [q (assoc-in (query {:aggregation [["sum" {} (field person-name "type/Text")]]})
                      [:stages 0 :lib/type] "mbql.stage/other")]
      (is (= [] (typing/validate (assoc (golden-snapshot) question-id (question q)) env))))))

(deftest ^:parallel semantic-is-the-reference-check-then-the-typing-test
  (let [s (assoc (golden-snapshot) question-id (question (query {:aggregation [["sum" {} (field person-name "type/Text")]]})))]
    (is (= [:query-typed] (map :rule (typing/semantic s env))))))

;;; ---------------------------------------------------- Properties ---------------------------------------------------

(def ^:private fields
  "The fields of the golden manifest, with their types."
  (sort-by str (for [[k {:keys [object effective-type]}] env :when (= :field object)] [k effective-type])))

(def ^:private aggregation-gen
  "A question with one aggregation of one field of the manifest: sum, avg or distinct."
  (gen/let [[k t] (gen/elements fields)
            op    (gen/elements ["sum" "avg" "distinct"])]
    {:op op :type t :question (question {:lib/type "mbql/query"
                                         :database db
                                         :stages   [{:lib/type     "mbql.stage/mbql"
                                                     :source-table (subvec k 0 3)
                                                     :aggregation  [[op {} (field k t)]]}]})}))

(defspec ^:parallel a-numeric-aggregation-of-a-field-is-typed-by-its-type-test 100
  (let [s (golden-snapshot)]
    (prop/for-all [{:keys [op type question]} aggregation-gen]
      (= (and (contains? #{"sum" "avg"} op) (not (isa? (keyword type) :type/Number)))
         (= [question-id] (map :id (typing/validate (assoc s question-id question) env)))))))

(defspec ^:parallel a-type-change-of-a-field-touches-only-its-users-test 50
  (let [s (golden-snapshot)]
    (prop/for-all [[k _] (gen/elements fields)]
      (let [found (set (map :id (typing/validate s (with-field-type env k "type/Text"))))]
        (every? (fn [id] (contains? (set (map (comp second second) (:refs (get s id)))) k)) found)))))

;;; ----------------------------------------------------- Mutations ---------------------------------------------------

(def ^:private mutations
  [{:name   :own-types
    :doc    "Each field reference keeps the type that the query says, not the type of the manifest."
    :target `typing/typed-query
    :edits  [[:replace '(typed-stage q n id->type) 'q]]}
   {:name   :types-unchecked
    :doc    "The query schema runs with the type checks of the clauses off."
    :target `typing/query-errors
    :edits  [[:replace 'false 'true]]}
   {:name   :unresolved-typed
    :doc    "A reference that the manifest does not resolve gets an id all the same, so its query is typed."
    :target `typing/import-resolver
    :edits  [[:replace '(unresolved! k) 1]]}])

(deftest typing-mutations-test
  (mut/check mutations {:tests [#'the-manifest-gives-the-types-test
                                #'a-field-of-the-wrong-type-is-a-finding-test
                                #'a-later-stage-has-the-types-of-the-stage-before-test
                                #'unresolved-references-are-not-typed-test]}))

(ns metabase.serialization.spec-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.entity :as serialization.entity]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [thunk]
    (doseq [[model model-ns] models.resolution/model->namespace
            :when (or config/ee-available? (not (str/starts-with? (str model-ns) "metabase-enterprise")))]
      (t2/resolve-model model))
    (thunk)))

(defn- schema-keys
  "The keys `schema` declares, across every branch of a `:multi`."
  [schema]
  (let [schema (mc/deref-all (mr/resolve-schema schema))]
    (set (if (= :multi (mc/type schema))
           (for [[_ _ branch] (mc/children schema)
                 [k]          (mc/entries (mc/deref-all branch))]
             k)
           (map first (mc/entries schema))))))

(defn- model-specs []
  (for [model (keys (dissoc (methods serialization/spec) :default))
        :when (isa? model :metabase/model)]
    [(name model) model (serialization/spec model)]))

(deftest specs-describe-every-column-test
  (mt/with-empty-h2-app-db!
    (doseq [[model-name model spec] (model-specs)]
      (testing model-name
        (let [columns    (u.conn/app-db-column-types (mdb/app-db) (t2/table-name model))
              serialized (set (concat (:copy spec)
                                      (for [[k t] (:transform spec)
                                            :when (:export t)]
                                        (:as t k))
                                      (keys (:children spec))))]
          (testing "selects only its own columns"
            (is (empty? (set/difference (set (serialization/columns model))
                                        (set (map (comp keyword u/lower-case-en) (keys columns)))))))
          (testing "transforms with fns"
            (doseq [[k transform] (:transform spec)]
              (is (or (contains? transform :export) (contains? transform :import)) (str k))
              (is (every? ifn? (keep transform [:export :import])) (str k))))
          (testing "declares every serialized key in its schema"
            (is (empty? (remove (schema-keys (:schema spec)) serialized)))))))))

(deftest validate-export-test
  (let [spec {:schema [:map {:closed true} [:name :string]]}]
    (mt/with-dynamic-fn-redefs [serialization.spec/spec-of (fn [_] spec)]
      (testing "export matching its spec's schema passes"
        (is (nil? (serialization.entity/validate-export :model/Model {:name "x"}))))
      (testing "export with key its spec's schema does not declare throws"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid export of :model/Model"
                              (serialization.entity/validate-export :model/Model {:name "x" :id 1})))))
    (mt/with-dynamic-fn-redefs [serialization.spec/spec-of (fn [_] {})]
      (testing "spec without schema throws"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No :schema"
                              (serialization.entity/validate-export :model/Model {:name "x"})))))))

(deftest children-name-their-parent-test
  (testing "each child model a spec names under :children names that model as its :parent, and only those do"
    (let [specs    (into {} (map (fn [[_ model spec]] [model spec])) (model-specs))
          children (for [[model spec] specs, [_ child] (:children spec)] [child model])
          parents  (for [[model spec] specs :when (:parent spec)] [model (:model (:parent spec))])]
      (is (= (set children) (set parents)))
      (doseq [[child parent] parents]
        (testing child
          (is (keyword? (:key (serialization.spec/parent child))))
          (is (contains? (set (keys (:children (get specs parent)))) (some (fn [[k c]] (when (= c child) k))
                                                                           (:children (get specs parent))))))))))

(deftest primary-keys-match-models-test
  (testing "the primary key of each spec is the first primary key of its model"
    (doseq [[model-name model] (model-specs)]
      (testing model-name
        (is (= (first (t2/primary-keys model)) (serialization.spec/primary-key model)))))))

(def ^:private implicit-columns
  "The columns a spec never declares, since serialization never exports them."
  #{:id :created_at :updated_at})

(defn- boolean-default
  "The boolean value of `default-value`, the database default of a column, or nil when it is none."
  [default-value]
  (when default-value
    (case (u/upper-case-en default-value)
      ("TRUE" "'TRUE'")   true
      ("FALSE" "'FALSE'") false
      nil)))

(defn- table-columns
  "The map from each column of the table of `model` to its type info, by lower-case keyword."
  [model]
  (update-keys (u.conn/app-db-column-types (mdb/app-db) (t2/table-name model))
               (comp keyword u/lower-case-en)))

(deftest specs-declare-exactly-table-columns-test
  (mt/with-empty-h2-app-db!
    (doseq [[model-name model spec] (model-specs)]
      (testing model-name
        (let [columns  (set (keys (table-columns model)))
              declared (concat (:copy spec) (:skip spec) (keys (:transform spec)))]
          (testing "declares each column once"
            (is (= (count declared) (count (set declared)))))
          (testing "copies, transforms and skips exactly the columns of its table"
            (is (= (set/difference columns implicit-columns) (set declared)))))))))

(deftest specs-declare-exactly-boolean-defaults-test
  (mt/with-empty-h2-app-db!
    (doseq [[model-name model spec] (model-specs)]
      (testing model-name
        (let [serialized (set (concat (:copy spec)
                                      (for [[k t] (:transform spec)
                                            :when (:export t)]
                                        k)))
              expected   (into {}
                               (keep (fn [[k {:keys [default]}]]
                                       (let [v (boolean-default default)]
                                         (when (and (some? v) (contains? serialized k))
                                           [k v]))))
                               (table-columns model))]
          (is (= expected (:defaults spec {}))))))))

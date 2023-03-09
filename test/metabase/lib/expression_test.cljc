(ns metabase.lib.expression-test
  (:require
   [clojure.test :refer [deftest is]]
   [clojure.test.check.generators :as gen]
   [clojure.walk :as walk]
   [com.gfredericks.test.chuck.clojure-test :as chuck.test :refer [checking]]
   [malli.core :as mc]
   [malli.generator :as mg]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.expression :as schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.mbql.util :as mbql.u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal])))
  #?(:cljs (:require-macros [metabase.mbql.util])))

(defn- field-metadata-gen
  [[_ id-or-name]]
  (if (integer? id-or-name)
    (gen/let [[table fields] (gen/elements (for [table (:tables meta/metadata)]
                                             [(:name table) (map :name (:fields table))]))
              field (gen/elements fields)]
      (-> (lib/query-for-table-name meta/metadata-provider table)
          (lib.metadata/field nil table field)))
    (gen/let [field (gen/elements (map :name (:columns meta/results-metadata)))]
      (-> (lib/saved-question-query meta/metadata-provider meta/saved-question)
          (lib.metadata/stage-column -1 field)))))

(def ^:private expression-expr-gen
  (gen/let [expression-shape (gen/such-that #(-> % first (= :field) not)
                                            (mg/generator ::schema.expression/expression))
            fields (gen/return (set (mbql.u/match expression-shape #{:field :field/unresolved})))
            field->metadata (gen/return (zipmap fields
                                                (map #(-> % field-metadata-gen gen/generate)
                                                     fields)))]
    (walk/postwalk (fn [form]
                     (if-let [metadata (field->metadata form)]
                       metadata
                       form))
                   expression-shape)))

(comment
  (gen/generate (field-metadata-gen ["field" 3]))
  (gen/sample expression-expr-gen)
  nil)

(def ^:private expression-creation-function
  "Map expression clause types to the corresponding creation function.
  To be extended whenever a new expression clause type is defined."
  {:abs lib/abs})

(deftest ^:parallel expression-creation
  (checking "expressions can be created"
    [expression-expr expression-expr-gen]
    (let [[op _options & args] expression-expr
          f (expression-creation-function op)]
      (is (some? f))
      (when f
        (is (fn? f))
        (is (mc/validate ::schema.expression/expression
                         (apply f {:lib/metadata meta/metadata} -1 args)))))))

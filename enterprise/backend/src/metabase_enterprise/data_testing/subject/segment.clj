(ns metabase-enterprise.data-testing.subject.segment
  "The `:segment` subject: the rows of a segment's table that match its filter. Expectation SQL names those rows
  `{{output}}`."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.util :as data-testing.u]
   [metabase-enterprise.data-testing.validator :as data-testing.validator]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn check-testable
  "Throws `::data-testing.errors/uncompilable-subject` when `segment` has no query to test: its definition reads back
  empty, names no table, or names a table that no longer exists or that sync has marked inactive. Nil `segment`
  passes."
  [{:keys [definition] :as segment}]
  (when segment
    (when (empty? definition)
      (throw (data-testing.errors/ex
              ::data-testing.errors/uncompilable-subject
              (tru "The segment''s definition is empty or unreadable, so there is no query to test.")
              {})))
    (let [table-id (lib/primary-source-table-id definition)]
      (when-not table-id
        (throw (data-testing.errors/ex
                ::data-testing.errors/uncompilable-subject
                (tru "The segment''s definition names no table, so there is no query to test.")
                {})))
      (when-not (data-testing.db/active-table-exists? table-id)
        (throw (data-testing.errors/ex
                ::data-testing.errors/uncompilable-subject
                (tru "The segment''s table no longer exists, so there is no query to test.")
                {}))))))

(mu/defn- with-declared-columns :- ::lib.schema/query
  "`definition` selecting only the columns of its table that the `:rows` input for that table declares, names compared
  as `driver` compares column names. Unchanged, so selecting every column, when there is no such input or it declares
  none of the table's columns."
  [definition     :- ::lib.schema/query
   inputs         :- ::data-testing.schema/inputs
   driver         :- :keyword
   default-schema :- [:maybe :string]]
  (let [{:keys [schema name]} (lib.metadata/table definition (lib/primary-source-table-id definition))
        input                 (some #(when (and (= :rows (:format %))
                                                (data-testing.validator/table-match?
                                                 {:schema schema :name name} (:table %) default-schema))
                                       %)
                                    inputs)
        column-key            (partial data-testing.u/column-key (data-testing.u/column-names-ignore-case? driver))
        declared              (into #{} (map (comp column-key :name)) (:columns input))
        columns               (filterv #(contains? declared (column-key (:name %)))
                                       (lib/returned-columns definition))]
    (cond-> definition
      (seq columns) (lib/with-fields columns))))

(mu/defmethod data-testing.subject/subject-plan :segment :- ::data-testing.subject/subject-plan
  [subject-type
   {:keys [definition] segment-name :name} :- ::data-testing.subject/segment
   {:keys [inputs] :as test-definition}    :- ::data-testing.subject/definition]
  (data-testing.subject/ensure-no-parameters subject-type test-definition)
  (let [database (data-testing.subject/testable-database (lib/database-id definition))]
    (data-testing.subject/query-output-plan
     database
     ;; A segment names no columns, so its query alone would select every column of its table, and an input would
     ;; have to declare them all.
     (data-testing.subject/compile-query (with-declared-columns definition inputs (keyword (:engine database)) (:default-schema database)))
     segment-name)))

(ns metabase-enterprise.data-testing.subject.segment
  "The `:segment` subject: the rows of a segment's table that match its filter, which expectation SQL names as
  `{{output}}`."
  (:require
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
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

(mu/defn- with-declared-columns :- ::lib.schema/query
  "`definition` selecting only the columns of its table that the `:rows` input for that table declares, by name, case
  aside. Unchanged, so selecting every column, when no such input declares one of them."
  [definition     :- ::lib.schema/query
   inputs         :- ::data-testing.schema/inputs
   default-schema :- [:maybe :string]]
  (let [{:keys [schema name]} (lib.metadata/table definition (lib/primary-source-table-id definition))
        input                 (some #(when (and (= :rows (:format %))
                                                (data-testing.validator/table-match?
                                                 {:schema schema :name name} (:table %) default-schema))
                                       %)
                                    inputs)
        declared              (into #{} (map (comp data-testing.u/fold-identifier :name)) (:columns input))
        columns               (filterv #(contains? declared (data-testing.u/fold-identifier (:name %)))
                                       (lib/returned-columns definition))]
    (cond-> definition
      (seq columns) (lib/with-fields columns))))

(mu/defmethod data-testing.subject/subject-plan :segment :- ::data-testing.subject/subject-plan
  [_subject-type
   {:keys [definition] segment-name :name} :- ::data-testing.subject/segment
   inputs                                  :- ::data-testing.schema/inputs]
  (let [database (data-testing.subject/testable-database (lib/database-id definition))]
    {:database      database
     ;; A segment names no columns, so its query alone would select every column of its table, and an input would
     ;; have to declare them all.
     :compiled      (data-testing.subject/compile-query
                     (with-declared-columns definition inputs (:default-schema database))
                     #(tru "The query under test could not be compiled to SQL: {0}" (ex-message %)))
     :output-tables [{:schema nil :name data-testing.compile/output-name}]
     :output-token  data-testing.subject/output-token
     :output-label  segment-name}))

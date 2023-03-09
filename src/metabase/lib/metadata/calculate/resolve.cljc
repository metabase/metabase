(ns metabase.lib.metadata.calculate.resolve
  "Logic for resolving references."
  (:refer-clojure :exclude [ref])
  (:require
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema.ref/keep-me)

(mu/defn ^:private resolve-field-id :- lib.metadata/ColumnMetadata
  "Integer Field ID: get metadata from the metadata provider. This is probably not 100% the correct thing to do if
  this isn't the first stage of the query, but we can fix that behavior in a follow-on"
  [query          :- ::lib.schema/query
   _stage-number  :- :int
   field-id       :- ::lib.schema.id/field]
  (lib.metadata/field query field-id))

(mu/defn ^:private resolve-field-name :- lib.metadata/ColumnMetadata
  "String column name: get metadata from the previous stage, if it exists, otherwise if this is the first stage and we
  have a native query or a Saved Question source query or whatever get it from our results metadata."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   column-name   :- ::lib.schema.common/non-blank-string]
  (or (some (fn [column]
              (when (= (:name column) column-name)
                column))
            (if-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
              (let [previous-stage (lib.util/query-stage query previous-stage-number)]
                (:lib/stage-metadata previous-stage))
              (get-in (lib.util/query-stage query stage-number) [:lib/stage-metadata :columns])))
      (throw (ex-info (i18n/tru "Invalid :field clause: column {0} does not exist" (pr-str column-name))
                      {:name         column-name
                       :query        query
                       :stage-number stage-number}))))

(mu/defn field-metadata :- lib.metadata/ColumnMetadata
  "Resolve metadata for a `:field` ref."
  [query                                        :- ::lib.schema/query
   stage-number                                 :- :int
   [_field _opts id-or-name, :as _field-clause] :- :mbql.clause/field]
  (if (integer? id-or-name)
    (resolve-field-id query stage-number id-or-name)
    (resolve-field-name query stage-number id-or-name)))

(mu/defn join :- ::lib.schema.join/join
  "Resolve a join with a specific `join-alias`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (or (m/find-first #(= (:alias %) join-alias)
                    (:joins (lib.util/query-stage query stage-number)))
      (throw (ex-info (i18n/tru "No join named {0}" (pr-str join-alias))
                      {:join-alias   join-alias
                       :query        query
                       :stage-number stage-number}))))

(mu/defn aggregation :- ::lib.schema.aggregation/aggregation
  "Resolve an aggregation with a specific `index`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   index        :- ::lib.schema.common/int-greater-than-or-equal-to-zero]
  (let [{aggregations :aggregation} (lib.util/query-stage query stage-number)]
    (when (<= (count aggregations) index)
      (throw (ex-info (i18n/tru "No aggregation at index {0}" index)
                      {:index        index
                       :query        query
                       :stage-number stage-number})))
    (nth aggregations index)))

(mu/defn expression :- ::lib.schema.expression/expression
  "Find the expression with `expression-name` in a given stage of a `query`, or throw an Exception if it doesn't
  exist."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   expression-name :- ::lib.schema.common/non-blank-string]
  (let [stage (lib.util/query-stage query stage-number)]
    (or (get-in stage [:expressions expression-name])
        (throw (ex-info (i18n/tru "No expression named {0}" (pr-str expression-name))
                        {:expression-name expression-name
                         :query           query
                         :stage-number    stage-number})))))

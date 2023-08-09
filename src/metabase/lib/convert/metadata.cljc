(ns metabase.lib.convert.metadata
  "Utilities for converting from MLv2-style metadata to legacy-style metadata."
  (:require
   [clojure.string :as str]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.schema :as mbql.s]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def LegacyColumn
  "Schema for a valid map of column info as found in the `:cols` key of the results after this namespace has ran."
  ;; name and display name can be blank because some wacko DBMSes like SQL Server return blank column names for
  ;; unaliased aggregations like COUNT(*) (this only applies to native queries, since we determine our own names for
  ;; MBQL.)
  [:map
   [:name         :string]
   [:display_name :string]
   ;; type of the Field. For Native queries we look at the values in the first 100 rows to make an educated guess
   [:base_type    ms/FieldType]
   ;; effective_type, coercion, etc don't go here. probably best to rename base_type to effective type in the return
   ;; from the metadata but that's for another day
   ;; where this column came from in the original query.
   [:source       [:enum :aggregation :fields :breakout :native]]
   ;; a field clause that can be used to refer to this Field if this query is subsequently used as a source query.
   ;; Added by this middleware as one of the last steps.
   [:field_ref {:optional true} mbql.s/AnyReference]])

(mu/defn ^:private legacy-display-name :- ::lib.schema.common/non-blank-string
  [query column-metadata]
  ;; FIXME
  (let [column-metadata (lib.temporal-bucket/with-temporal-bucket column-metadata nil)]
    (lib.metadata.calculation/display-name query -1 column-metadata :long)))

(mu/defn ^:private legacy-ref :- mbql.s/AnyReference
  [query column-metadata]
  (binding [lib.convert/*pMBQL-stage* (lib.util/query-stage query -1)]
    (lib.convert/->legacy-MBQL (lib.ref/ref column-metadata))))

(defn- legacy-source [column-metadata]
  (case (:lib/source column-metadata)
    :source/card                :fields
    :source/native              :native
    :source/previous-stage      :fields
    :source/table-defaults      :fields
    :source/fields              :fields
    :source/aggregations        :aggregation
    :source/breakouts           :breakout
    :source/joins               :fields
    :source/expressions         :fields
    :source/implicitly-joinable :fields))

(mu/defn ->legacy-column-metadata :- LegacyColumn
  "Convert MLv2 column metadata to legacy metadata (similar to what the QP would return in results metadata)."
  [query           :- ::lib.schema/query
   column-metadata :- lib.metadata/ColumnMetadata]
  (try
    (let [column-metadata (merge column-metadata
                                 {:display-name (legacy-display-name query column-metadata)
                                  :field-ref    (legacy-ref query column-metadata)
                                  :source       (legacy-source column-metadata)}
                                 (when-let [join-alias (lib.join/current-join-alias column-metadata)]
                                   {:source-alias join-alias}))]
      (into {}
            (comp (remove (fn [[k _v]]
                            (when-let [key-namespace (namespace k)]
                              (or (= key-namespace "lib")
                                  (str/starts-with? key-namespace "metabase.lib")))))
                  (map (fn [[k v]]
                         [(u/->snake_case_en k) v])))
            column-metadata))
    (catch #?(:clj Throwable :cljs :default) e
      (throw (ex-info (str "Error converting MLv2 metadata to legacy metadata: " (ex-message e))
                      {:query query, :metadata column-metadata}
                      e)))))

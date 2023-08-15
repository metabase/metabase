(ns metabase.lib.convert.metadata
  "Utilities for converting from MLv2-style metadata to legacy-style metadata."
  (:require
   [clojure.string :as str]
   [metabase.lib.binning :as lib.binning]
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
   [metabase.mbql.util :as mbql.u]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def LegacyColumn
  "Schema for a valid map of column info as found in the `:cols` key of the results after this namespace has ran."
  ;; name and display name can be blank because some wacko DBMSes like SQL Server return blank column names for
  ;; unaliased aggregations like COUNT(*) (this only applies to native queries, since we determine our own names for
  ;; MBQL.)
  [:map
   [:name         :string]
   [:display_name :string]
   ;; type of the Field. For Native queries we look at the values in the first 100 rows to make an educated guess
   [:base_type    [:ref ::lib.schema.common/base-type]]
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
  (let [column-metadata (-> column-metadata
                            (lib.temporal-bucket/with-temporal-bucket nil)
                            (lib.binning/with-binning nil))]
    (lib.metadata.calculation/display-name query -1 column-metadata :long)))

;; TODO -- duplicated with [[metabase.query-processor.middleware.add-default-temporal-unit/add-default-temporal-unit]]
(defn- add-default-temporal-bucket [col]
  (if (and (not (lib.temporal-bucket/temporal-bucket col))
           (isa? (:effective-type col) :type/Temporal))
    (lib.temporal-bucket/with-temporal-bucket col :default)
    col))

(mu/defn ^:private legacy-ref :- mbql.s/AnyReference
  [query column-metadata]
  (binding [lib.convert/*pMBQL-stage* (lib.util/query-stage query -1)]
    (mbql.match/replace (lib.convert/->legacy-MBQL (lib.ref/ref (add-default-temporal-bucket column-metadata)))
      [:field (field-id :guard integer?) (opts :guard map?)]
      (mbql.u/update-field-options &match dissoc :base-type :effective-type))))

(defn- legacy-source [column-metadata]
  (case (:lib/source column-metadata)
    :source/card                :fields
    :source/native              :native
    :source/previous-stage      :fields
    :source/table-defaults      :fields
    :source/external-remaps     :fields
    :source/fields              :fields
    :source/aggregations        :aggregation
    :source/breakouts           :breakout
    :source/joins               :fields
    :source/expressions         :fields
    :source/implicitly-joinable :fields))

(mu/defn ->legacy-column-metadata :- LegacyColumn
  "Convert MLv2 column metadata to legacy metadata (similar to what the QP would return in results metadata)."
  ([column-metadata :- lib.metadata/ColumnMetadata]
   (let [column-metadata (merge
                          #_{:coercion-strategy nil
                             :settings          nil
                             :nfc-path          nil
                             :parent-id         nil
                             :fingerprint       nil}
                          column-metadata
                          {:name         ((some-fn :lib/desired-column-alias :name) column-metadata)
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
           column-metadata)))

  ([query :- ::lib.schema/query
    column-metadata]
   (try
     (->legacy-column-metadata
      (assoc column-metadata
             :display-name (legacy-display-name query column-metadata)
             :field-ref    (legacy-ref query column-metadata)))
     (catch #?(:clj Throwable :cljs :default) e
       (throw (ex-info (str "Error converting MLv2 metadata to legacy metadata: " (ex-message e))
                       {:query query, :metadata column-metadata}
                       e))))))

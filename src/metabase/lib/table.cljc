(ns metabase.lib.table
  (:require
   [better-cond.core :as b]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]))

(defmethod lib.metadata.calculation/display-name-method :metadata/table
  [_query _stage-number table-metadata _style]
  (or (:display-name table-metadata)
      (some->> (:name table-metadata)
               (u.humanization/name->human-readable-name :simple))))

(defmethod lib.metadata.calculation/metadata-method :metadata/table
  [_query _stage-number table-metadata]
  table-metadata)

(defmethod lib.metadata.calculation/describe-top-level-key-method :source-table
  [query stage-number _k]
  (let [stage (lib.util/query-stage query stage-number)]
    (when-let [source-table-id (:source-table stage)]
      (b/cond
        (integer? source-table-id)
        (or (when-let [table-metadata (lib.metadata/table query source-table-id)]
              (lib.metadata.calculation/display-name query stage-number table-metadata :long))
            (i18n/tru "Table {0}" source-table-id))

        :let [card-id (lib.util/string-table-id->card-id source-table-id)]

        card-id
        (or (when-let [card-metadata (lib.metadata/card query card-id)]
              (lib.metadata.calculation/display-name query stage-number card-metadata :long))
            ;; If for some reason the metadata is unavailable. This is better than returning nothing I guess
            (i18n/tru "Saved Question {0}" card-id))

        :else
        (throw (ex-info (i18n/tru "Unexpected source table ID {0}" (pr-str source-table-id))
                        {:query query, :source-table-id source-table-id}))))))

(defn- remove-hidden-default-fields
  "Remove Fields that shouldn't be visible from the default Fields for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/table->sorted-fields*]]."
  [field-metadatas]
  (remove (fn [{:keys [visibility-type], active? :active, :as _field-metadata}]
            (or (false? active?)
                (#{:sensitive :retired} (some-> visibility-type keyword))))
          field-metadatas))

(defn- sort-default-fields
  "Sort default Fields for a source Table. See [[metabase.models.table/field-order-rule]]."
  [field-metadatas]
  (sort-by (fn [{field-name :name, :keys [position], :as _field-metadata}]
             [(or position 0) (u/lower-case-en (or field-name ""))])
           field-metadatas))

(defmethod lib.metadata.calculation/projected-columns-method :metadata/table
  [query _stage-number table-metadata unique-name-fn]
  (when-let [field-metadatas (lib.metadata/fields query (:id table-metadata))]
    (->> field-metadatas
         remove-hidden-default-fields
         sort-default-fields
         (map (fn [col]
                (assoc col
                       :lib/source               :source/table-defaults
                       :lib/source-column-alias  (:name col)
                       :lib/desired-column-alias (unique-name-fn (:name col))))))))

(defmethod lib.join/with-join-alias-method :metadata/table
  [table-metadata join-alias]
  (assoc table-metadata ::join-alias join-alias))

(defmethod lib.join/current-join-alias-method :metadata/table
  [table-metadata]
  (::join-alias table-metadata))

(defmethod lib.join/with-join-fields-method :metadata/table
  [table-metadata fields]
  (assoc table-metadata ::join-fields fields))

(defmethod lib.join/join-clause-method :metadata/table
  [query stage-number {::keys [join-alias join-fields], :as table-metadata}]
  (cond-> (lib.join/join-clause query
                                stage-number
                                {:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid (str (random-uuid))}
                                 :source-table (:id table-metadata)})
    join-alias  (lib.join/with-join-alias join-alias)
    join-fields (lib.join/with-join-fields join-fields)))

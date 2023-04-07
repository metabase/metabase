(ns metabase.lib.table
  (:require
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.humanization :as u.humanization]))

(defmethod lib.metadata.calculation/display-name-method :metadata/table
  [_query _stage-number table-metadata]
  (or (:display_name table-metadata)
      (some->> (:name table-metadata)
               (u.humanization/name->human-readable-name :simple))))

(defmethod lib.metadata.calculation/metadata-method :metadata/table
  [_query _stage-number table-metadata]
  table-metadata)

(defn- describe-source-table [query stage-number source-table-id]
  (when-let [table-metadata (lib.metadata/table query source-table-id)]
    (lib.metadata.calculation/display-name query stage-number table-metadata)))

(defmethod lib.metadata.calculation/display-name-method :metadata/card
  [_query _stage-number card-metadata]
  ((some-fn :display_name :name) card-metadata))

(defn- describe-source-query [query stage-number source-table-card-str]
  (when-let [card-id (lib.util/string-table-id->card-id source-table-card-str)]
    (or (when-let [card-metadata (lib.metadata/card query card-id)]
          (lib.metadata.calculation/display-name query stage-number card-metadata))
        ;; If for some reason the metadata is unavailable. This is better than returning nothing I guess
        (i18n/tru "Saved Question {0}" card-id))))

(defmethod lib.metadata.calculation/describe-top-level-key-method :source-table
  [query stage-number _k]
  (let [stage (lib.util/query-stage query stage-number)]
    (when-let [source-table-id (:source-table stage)]
      (cond
        (integer? source-table-id)
        (describe-source-table query stage-number source-table-id)

        (string? source-table-id)
        (describe-source-query query stage-number source-table-id)

        :else
        (throw (ex-info (i18n/tru "Unexpected source table ID {0}" (pr-str source-table-id))
                        {:query query, :source-table-id source-table-id}))))))

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

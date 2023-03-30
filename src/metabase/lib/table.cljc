(ns metabase.lib.table
  (:require
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

(defn- describe-source-table [query stage-number source-table-id]
  (when-let [table-metadata (lib.metadata/table query source-table-id)]
    (lib.metadata.calculation/display-name query stage-number table-metadata)))

(defmethod lib.metadata.calculation/display-name-method :metadata/card
  [_query _stage-number card-metadata]
  ((some-fn :display_name :name) card-metadata))

(defn- describe-source-query [query stage-number source-table-card-str]
  (when-let [card-id-str (second (re-find #"^card__(\d+)$" source-table-card-str))]
    (let [card-id (parse-long card-id-str)]
      (or (when-let [card-metadata (lib.metadata/card query card-id)]
            (lib.metadata.calculation/display-name query stage-number card-metadata))
          ;; If for some reason the metadata is unavailable. This is better than returning nothing I guess
          (i18n/tru "Saved Question {0}" card-id)))))

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

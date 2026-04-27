(ns metabase.metabot.tools.field-stats
  (:require
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [toucan2.core :as t2]))

(defn- build-field-statistics [fvs fp limit]
  (merge
   (when fp
     {:statistics (-> (or (:global fp) {})
                      (set/rename-keys {:nil% :percent-null})
                      (into (vals (:type fp))))})
   (when-let [fvs (-> fvs :values not-empty)]
     {:field_values (into [] (if limit (take limit) identity) fvs)})))

(defn- get-or-create-fingerprint! [{:keys [id fingerprint] :as field}]
  (or fingerprint
      ;; Run with admin perms to match behavior during normal sync.
      (and (pos? (:updated-fingerprints (request/as-admin (sync/refingerprint-field! field))))
           (t2/select-one-fn :fingerprint :model/Field :id id))))

(defn- field-statistics
  [{:keys [id fingerprint]} limit]
  (if id
    (let [field (t2/select-one :model/Field :id id)
          fvs (params.field-values/get-or-create-field-values! field)
          fp (or fingerprint (get-or-create-fingerprint! field))]
      (build-field-statistics fvs fp limit))
    (build-field-statistics nil fingerprint limit)))

(defn- table-field-stats
  [table-id field-id limit]
  (try
    (let [query        (or (metabot.tools.u/table-query table-id)
                           (throw (ex-info (str "No table found with ID " table-id)
                                           {:agent-error? true :status-code 404})))
          visible-cols (lib/visible-columns query)
          col          (metabot.tools.u/find-column-by-field-id field-id visible-cols)]
      {:structured-output {:result-type    :field-metadata
                           :field_id       field-id
                           :value_metadata (field-statistics col limit)}})
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

(defn- card-field-stats
  [card-id field-id limit card-type]
  (try
    (let [query        (or (metabot.tools.u/card-query card-id)
                           (throw (ex-info (str "No " card-type " found with ID " card-id)
                                           {:agent-error? true :status-code 404})))
          visible-cols (lib/visible-columns query)
          col          (metabot.tools.u/find-column-by-field-id field-id visible-cols)]
      {:structured-output {:result-type    :field-metadata
                           :field_id       field-id
                           :value_metadata (field-statistics col limit)}})
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

(defn- metric-field-stats
  [metric-id field-id limit]
  (try
    (let [query           (or (metabot.tools.u/metric-query metric-id)
                              (throw (ex-info (str "No metric found with ID " metric-id)
                                              {:agent-error? true :status-code 404})))
          filterable-cols (lib/filterable-columns query)
          col             (metabot.tools.u/find-column-by-field-id field-id filterable-cols)]
      {:structured-output {:result-type    :field-metadata
                           :field_id       field-id
                           :value_metadata (field-statistics col limit)}})
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (case entity-type
    "metric"                      (metric-field-stats entity-id field-id limit)
    ("model" "report" "question") (card-field-stats entity-id field-id limit entity-type)
    "table"                       (table-field-stats entity-id field-id limit)))

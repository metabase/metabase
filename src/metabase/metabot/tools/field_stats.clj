(ns metabase.metabot.tools.field-stats
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.parameters.field :as params.field]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [toucan2.core :as t2]))

(def ^:private default-sample-limit 100)

(defn- normalize-search-value
  "Convert search-values rows into a single sample value for field metadata.
   Remapped rows are returned as [value display], so prefer the display value."
  [value]
  (if (sequential? value)
    (let [[raw display] value]
      (or display raw))
    value))

(defn- fetch-sample-values-from-db
  [field-id limit]
  (let [{:keys [values]} (params.field/search-values-from-field-id field-id nil)]
    (->> values
         (map normalize-search-value)
         (take (or limit default-sample-limit))
         vec)))

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
          fp (or fingerprint (get-or-create-fingerprint! field))
          fvs (if (seq (:values fvs))
                fvs
                {:values (fetch-sample-values-from-db id (or limit default-sample-limit))})]
      (build-field-statistics fvs fp limit))
    (build-field-statistics nil fingerprint limit)))

(defn- resolve-table-field
  [table-id agent-field-id]
  (let [field-id-prefix (metabot.tools.u/table-field-id-prefix table-id)
        ;; When the field ID belongs to a different table (e.g., agent saw a related field
        ;; listed under table 111 as t111-21 but requests it via metabase://table/173/fields/t111-21),
        ;; resolve against the correct table from the field ID prefix.
        effective-table-id (if (str/starts-with? agent-field-id field-id-prefix)
                             table-id
                             (let [parsed (metabot.tools.u/parse-field-id agent-field-id)]
                               (if (and parsed (= "t" (:model-tag parsed)) (:model-id parsed))
                                 (:model-id parsed)
                                 table-id)))
        query              (or (metabot.tools.u/table-query effective-table-id)
                               (throw (ex-info (str "No table found with ID " effective-table-id)
                                               {:agent-error? true :status-code 404})))
        eff-prefix         (metabot.tools.u/table-field-id-prefix effective-table-id)
        visible-cols       (lib/visible-columns query)]
    (:column (metabot.tools.u/resolve-column {:field-id agent-field-id} eff-prefix visible-cols))))

(defn- resolve-card-field
  [card-id agent-field-id card-type]
  (let [query           (or (metabot.tools.u/card-query card-id)
                            (throw (ex-info (str "No " card-type " found with ID " card-id)
                                            {:agent-error? true :status-code 404})))
        field-id-prefix (metabot.tools.u/card-field-id-prefix card-id)
        visible-cols    (lib/visible-columns query)]
    (:column (metabot.tools.u/resolve-column {:field-id agent-field-id} field-id-prefix visible-cols))))

(defn- resolve-metric-field
  [metric-id agent-field-id]
  (let [query           (or (metabot.tools.u/metric-query metric-id)
                            (throw (ex-info (str "No metric found with ID " metric-id)
                                            {:agent-error? true :status-code 404})))
        field-id-prefix (metabot.tools.u/card-field-id-prefix metric-id)
        filterable-cols (lib/filterable-columns query)]
    (:column (metabot.tools.u/resolve-column {:field-id agent-field-id} field-id-prefix filterable-cols))))

(defn resolve-field
  "Resolve a Metabot field reference into the underlying column metadata."
  [{:keys [entity-type entity-id field-id]}]
  (case entity-type
    "metric"           (resolve-metric-field entity-id field-id)
    ("model" "report") (resolve-card-field entity-id field-id entity-type)
    "table"            (resolve-table-field entity-id field-id)))

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (try
    (let [col (resolve-field {:entity-type entity-type
                              :entity-id   entity-id
                              :field-id    field-id})]
      {:structured-output {:result-type    :field-metadata
                           :field_id       field-id
                           :value_metadata (field-statistics col limit)}})
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

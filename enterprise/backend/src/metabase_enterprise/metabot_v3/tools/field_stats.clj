(ns metabase-enterprise.metabot-v3.tools.field-stats
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.sync.core :as sync]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(defn- build-field-statistics [fvs fp limit]
  (merge
   (when fp
     {:statistics (-> (or (:global fp) {})
                      (set/rename-keys {:nil% :percent-null})
                      (into (vals (:type fp))))})
   (when-let [fvs (-> fvs :values not-empty)]
     {:values (into [] (if limit (take limit) identity) fvs)})))

(defn- get-or-create-fingerprint! [{:keys [id fingerprint] :as field}]
  (or fingerprint
      (and (pos? (:updated-fingerprints (sync/refingerprint-field! field)))
           (t2/select-one-fn :fingerprint :model/Field :id id))))

(defn- field-statistics
  [{:keys [id fingerprint]} limit]
  (if id
    (let [field (t2/select-one :model/Field :id id)
          fvs (field-values/get-or-create-full-field-values! field)
          fp (or fingerprint (get-or-create-fingerprint! field))]
      (build-field-statistics fvs fp limit))
    (build-field-statistics nil fingerprint limit)))

(defn- table-field-stats
  [table-id agent-field-id limit]
  (try
    (let [field-id-prefix (metabot-v3.tools.u/table-field-id-prefix table-id)
          index (metabot-v3.tools.u/resolve-column-index agent-field-id field-id-prefix)
          query (metabot-v3.tools.u/table-query table-id)]
      (if query
        (if-let [col (nth (lib/visible-columns query) index nil)]
          {:structured-output (field-statistics col limit)}
          {:output (str "No field found with ID " agent-field-id)})
        {:output (str "No table found with ID " table-id)}))
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(defn- card-field-stats
  [card-id agent-field-id limit card-type]
  (try
    (let [field-id-prefix (metabot-v3.tools.u/card-field-id-prefix card-id)
          index (metabot-v3.tools.u/resolve-column-index agent-field-id field-id-prefix)
          query (metabot-v3.tools.u/card-query card-id)]
      (if query
        (if-let [col (nth (lib/visible-columns query) index nil)]
          {:structured-output (field-statistics col limit)}
          {:output (str "No field found with ID " agent-field-id)})
        {:output (str "No " card-type " found with ID " card-id)}))
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(defn- metric-field-stats
  [metric-id agent-field-id limit]
  (try
    (let [field-id-prefix (metabot-v3.tools.u/card-field-id-prefix metric-id)
          index (metabot-v3.tools.u/resolve-column-index agent-field-id field-id-prefix)
          query (metabot-v3.tools.u/metric-query metric-id)]
      (if query
        (if-let [col (nth (lib/filterable-columns query) index nil)]
          {:structured-output (field-statistics col limit)}
          {:output (str "No field found with ID " agent-field-id)})
        {:output (str "No metric found with ID " metric-id)}))
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(comment
  (t2/select-pk->fn :field_id :model/FieldValues)
  (sort-by key (t2/select-pk->fn :name :model/Table))
  (sort-by first (t2/select-fn-vec (juxt :position :name) :model/Field :table_id 8))
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (let [table-id 25]
      (-> (for [col-pos (range 15)]
            [col-pos (table-field-stats table-id (str (metabot-v3.tools.u/table-field-id-prefix table-id) col-pos) 15)])
          vec)))
  -)

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (case entity-type
    "metric"           (metric-field-stats entity-id field-id limit)
    ("model" "report") (card-field-stats entity-id field-id limit entity-type)
    "table"            (table-field-stats entity-id field-id limit)))

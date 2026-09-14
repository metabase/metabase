(ns metabase.query-processor.middleware.table-remapping
  "Table remapping: the tables a query reads in place of the ones it names, bound with [[with-table-remappings]] or,
  when unbound, the instance default. MBQL stages get a metadata provider answering with the replacement tables;
  native stages have their SQL rewritten."
  (:refer-clojure :exclude [empty? mapv])
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [empty? mapv]]))

(set! *warn-on-reflection* true)

(mr/def ::remappings
  [:sequential ::driver/table-remapping])

(def ^:dynamic *table-remappings*
  "The remappings in force, or `::default` for the instance default."
  ::default)

(defmacro with-table-remappings
  "Run `body` with exactly `remappings` in force; `[]` reads every table as named."
  [remappings & body]
  `(binding [*table-remappings* ~remappings]
     ~@body))

(mu/defn remappings-for :- ::remappings
  "The remappings in force for a query on the Database with `db-id`."
  [db-id :- ::lib.schema.id/database]
  (if (= *table-remappings* ::default)
    (qp.middleware.enterprise/default-table-remappings db-id)
    *table-remappings*))

(mu/defn- rewrite-sql :- :string
  [driver     :- :keyword
   sql        :- :string
   remappings :- ::remappings]
  (try
    (driver/remap-native-query-tables driver sql remappings)
    (catch Exception e
      (throw (ex-info (tru "Table remapping failed: cannot parse the native query.")
                      {:type qp.error-type/qp, :driver driver}
                      e)))))

(mu/defn- rewrite-native-stages :- ::lib.schema/query
  [query      :- ::lib.schema/query
   driver     :- :keyword
   remappings :- ::remappings]
  (lib.walk/walk-stages
   query
   (fn [_query _path stage]
     (when (and (lib/native-stage? stage)
                (string? (:native stage)))
       (update stage :native #(rewrite-sql driver % remappings))))))

(mu/defn- table-transform :- [:=> [:cat :map [:sequential :any]] [:sequential :any]]
  "A [[lib.metadata/transforming-metadata-provider]] transform moving each `:metadata/table` result to its
  replacement."
  [remappings :- ::remappings]
  (let [replacement (into {} (map (juxt (juxt :from-schema :from-table) identity)) remappings)]
    (fn [{metadata-type :lib/type} results]
      (if (= metadata-type :metadata/table)
        (mapv (fn [{:keys [schema name] :as table}]
                (if-let [{:keys [to-schema to-table]} (replacement [schema name])]
                  (assoc table :schema to-schema, :name to-table)
                  table))
              results)
        results))))

(defn- install-metadata-provider!
  "Put `mp` in the QP store for the rest of the query, which `with-metadata-provider` alone would restore."
  [mp]
  (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
    (qp.store/with-metadata-provider mp)))

(mu/defn apply-table-remappings :- ::lib.schema/query
  "Pre-processing middleware. Points the query at the replacement tables the remappings in force name."
  [query :- ::lib.schema/query]
  (let [remappings (remappings-for (:database query))]
    (if (empty? remappings)
      query
      (let [mp (lib.metadata/transforming-metadata-provider (table-transform remappings) (:lib/metadata query))]
        (install-metadata-provider! mp)
        (-> query
            (assoc :lib/metadata mp)
            (rewrite-native-stages driver/*driver* remappings))))))

(ns metabase-enterprise.data-apps.guards
  "The rules a data app's requests are held to: it uses only the resources of its own app, the cards in the app's
  collection, the tables those cards name as their sources, and the tables those tables' foreign keys point to."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- refusal
  "A 403 error refusing a data app's request, with `message` and, when given, the `cause` of the refusal."
  ([message]
   (ex-info message {:status-code 403}))
  ([message cause]
   (ex-info message {:status-code 403} cause)))

(defn- request-app
  "The data app that `request` names in its `X-Metabase-Client-Identifier` header; throws a 403 when it names none."
  [request]
  (or (some-> (get-in request [:headers "x-metabase-client-identifier"]) not-empty data-apps.db/data-app-by-slug)
      (throw (refusal (tru "A data app request must name a data app on this instance.")))))

(defn- app-card-ids
  "The IDs of the cards in the collection of `app`."
  [app]
  (if-let [collection-id (:resource_collection_id app)]
    (data-apps.db/app-card-ids collection-id)
    #{}))

(defn- refuse-cards!
  "Throws a 403 naming the cards with `card-ids`, which a data app may not use."
  [metadata-providerable card-ids]
  (throw (refusal (tru "A data app can use only the cards of its own app, not {0}."
                       (str/join ", " (for [{card-name :name, card-id :id}
                                            (sort-by :id (lib.metadata/bulk-metadata metadata-providerable :metadata/card
                                                                                     card-ids))]
                                        (format "\"%s\" (%d)" card-name card-id)))))))

(defenterprise check-query!
  "Throws a 403 unless `query`, a legacy or MBQL 5 query map that the data app of `request` runs, is an MBQL query
  without parameters whose sources and joins are the cards of that app."
  :feature :data-apps
  [request query]
  (let [card-ids (app-card-ids (request-app request))]
    (when-not (and (map? query)
                   (pos-int? (:database query))
                   (data-apps.db/database-exists? (:database query)))
      (throw (refusal (tru "A data app can run only queries on a database."))))
    (let [query (try
                  (lib/query (lib-be/application-database-metadata-provider (:database query)) query)
                  (catch Exception e
                    (throw (refusal (tru "A data app can run only valid queries.") e))))]
      (when (or (seq (:parameters query)) (some (comp seq :parameters) (:stages query)))
        (throw (refusal (tru "A data app can run only queries without parameters."))))
      (when (lib/any-native-stage? query)
        (throw (refusal (tru "A data app can run only queries built with the query builder, not SQL."))))
      (when (or (seq (lib/all-source-table-ids query))
                (seq (lib/all-segment-ids query))
                (seq (lib/all-measure-ids query)))
        (throw (refusal (tru "A data app can query only the cards of its own app, not tables, segments or measures."))))
      (when-let [outside (not-empty (set/difference (set (lib/all-source-card-ids query)) card-ids))]
        (refuse-cards! query outside))))
  nil)

(defn- card-row
  "The ID and database ID of the card whose ID or entity ID is the route param `card-id`, or nil when there is none."
  [card-id]
  (if (= 21 (count card-id))
    (data-apps.db/card-by-entity-id card-id)
    (some-> (parse-long card-id) data-apps.db/card-by-id)))

(defenterprise check-card!
  "Throws a 403 unless the card with `card-id`, an ID or an entity ID, is a card of the data app of `request`, when such
  a card exists."
  :feature :data-apps
  [request card-id]
  (let [card-ids (app-card-ids (request-app request))]
    (when-let [{:keys [id database_id]} (card-row card-id)]
      (when-not (contains? card-ids id)
        (refuse-cards! (lib-be/application-database-metadata-provider database_id) #{id}))))
  nil)

(defn- app-table-ids
  "The IDs of the tables that the cards of the data app of `request` name as their sources, in their stages and joins,
  and of the tables those tables' foreign keys point to."
  [request]
  (let [source-ids (into #{}
                         (mapcat (fn [{:keys [id database_id]}]
                                   (let [mp (lib-be/application-database-metadata-provider database_id)]
                                     (lib/all-source-table-ids (lib/query mp (:dataset-query (lib.metadata/card mp id)))))))
                         (some-> (not-empty (app-card-ids (request-app request))) data-apps.db/cards-by-ids))]
    (into source-ids
          (some->> (not-empty source-ids)
                   data-apps.db/fk-target-field-ids-of-tables
                   not-empty
                   data-apps.db/field-table-ids
                   vals))))

(defn- refuse-tables!
  "Throws a 403 naming the tables with `table-ids`, which a data app may not read."
  [table-ids]
  (throw (refusal (tru "A data app can read only the tables its own cards use, not {0}."
                       (str/join ", " (sort (vals (data-apps.db/table-names table-ids))))))))

(defenterprise check-table!
  "Throws a 403 unless the table with `table-id`, a route param, is a source of a card of the data app of `request` or a
  table one of those sources' foreign keys points to, when such a table exists."
  :feature :data-apps
  [request table-id]
  (when-let [table-id (parse-long table-id)]
    (when (and (not (contains? (app-table-ids request) table-id))
               (seq (data-apps.db/table-names #{table-id})))
      (refuse-tables! #{table-id})))
  nil)

(defenterprise check-field!
  "Throws a 403 unless the field with `field-id`, a route param, is in a table that the data app of `request` may read, as
  [[check-table!]] has it, when such a field exists."
  :feature :data-apps
  [request field-id]
  (when-let [table-id (some->> (parse-long field-id) hash-set data-apps.db/field-table-ids vals first)]
    (when-not (contains? (app-table-ids request) table-id)
      (refuse-tables! #{table-id})))
  nil)

(ns metabase-enterprise.data-apps.checks
  "The checks that hold a data app's requests to the resources of its own app: the cards and actions in the app's
  collection."
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

(defenterprise request-data-app
  "The data app that a data-app `request` names in its `X-Metabase-Client-Identifier` header; throws a 403 when it names
  none."
  :feature :data-apps
  [request]
  (or (some-> (get-in request [:headers "x-metabase-client-identifier"]) not-empty data-apps.db/data-app-by-slug)
      (throw (refusal (tru "A data app request must name a data app on this instance.")))))

(defn- app-card-ids
  "The IDs of the cards in the collection of `data-app`."
  [data-app]
  (if-let [collection-id (:resource_collection_id data-app)]
    (data-apps.db/app-card-ids collection-id)
    #{}))

(defn- refuse-cards
  "Throws a 403 naming the cards with `card-ids`, which a data app may not use."
  [metadata-providerable card-ids]
  (throw (refusal (tru "A data app can use only the cards of its own app, not {0}."
                       (str/join ", " (for [{card-name :name, card-id :id}
                                            (sort-by :id (lib.metadata/bulk-metadata metadata-providerable :metadata/card
                                                                                     card-ids))]
                                        (format "\"%s\" (%d)" card-name card-id)))))))

(defenterprise check-query
  "Throws a 403 unless `query`, a legacy or MBQL 5 query map, is an MBQL query without parameters whose sources and
  joins are the cards of `data-app`."
  :feature :data-apps
  [data-app query]
  (let [card-ids (app-card-ids data-app)]
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
        (refuse-cards query outside))))
  nil)

(defenterprise check-card
  "Throws a 403 unless the card with `card-id` is a card of `data-app`."
  :feature :data-apps
  [data-app card-id]
  (when-not (contains? (app-card-ids data-app) card-id)
    (refuse-cards (lib-be/application-database-metadata-provider (data-apps.db/card-database-id card-id)) #{card-id}))
  nil)

(defenterprise check-card-run
  "Throws a 403 unless the card with `card-id` is a card of `data-app` and the `run` options of the request run it as it
  is saved: without parameters, a dashboard, a collection preview, a stored result or a sort."
  :feature :data-apps
  [data-app card-id {:keys [parameters dashboard-id collection-preview stored-result-id sort]}]
  (check-card data-app card-id)
  (when (or (seq parameters) dashboard-id collection-preview stored-result-id sort)
    (throw (refusal (tru "A data app can run a card only as it is saved, without parameters, a dashboard, a collection preview or a stored result."))))
  nil)

(defn- app-table-ids
  "The IDs of the tables that the cards of `data-app` name as their sources, in their stages and joins, and of the tables
  those tables' foreign keys point to."
  [data-app]
  (let [source-ids (into #{}
                         (mapcat (fn [{:keys [id database_id]}]
                                   (let [mp (lib-be/application-database-metadata-provider database_id)]
                                     (lib/all-source-table-ids (lib/query mp (:dataset-query (lib.metadata/card mp id)))))))
                         (some-> (not-empty (app-card-ids data-app)) data-apps.db/cards-by-ids))]
    (into source-ids
          (some->> (not-empty source-ids)
                   data-apps.db/fk-target-field-ids-of-tables
                   not-empty
                   data-apps.db/field-table-ids
                   vals))))

(defenterprise check-field
  "Throws a 403 unless the field with `field-id` is in a table that a card of `data-app` names as a source, or in a table
  one of those tables' foreign keys points to, when such a field exists."
  :feature :data-apps
  [data-app field-id]
  (when-let [table-id (some->> field-id hash-set data-apps.db/field-table-ids vals first)]
    (when-not (contains? (app-table-ids data-app) table-id)
      (throw (refusal (tru "A data app can read only the tables its own cards use, not {0}."
                           (get (data-apps.db/table-names #{table-id}) table-id))))))
  nil)

(ns metabase-enterprise.data-apps.rules
  "The Library-only rules a data app's requests are held to: it reads only tables published to the Library, the metrics
  in the Library and the cards in data apps' collections, through MBQL queries alone."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.queries.core :as queries]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- refusal
  "A 403 error refusing a data app's request, with `message` and, when given, the `cause` of the refusal."
  ([message]
   (ex-info message {:status-code 403}))
  ([message cause]
   (ex-info message {:status-code 403} cause)))

(defn- refuse-cards!
  "Throws a 403 naming the cards with `card-ids`, which a data app may not read."
  [metadata-providerable card-ids]
  (throw (refusal (tru "A data app can read only the cards of data apps and the metrics in the Library, not {0}."
                       (queries/card-labels metadata-providerable card-ids)))))

(defn- check-lib-query!
  "Throws unless `query` and the cards it uses, which aren't among `checked-card-ids`, read only the Library through MBQL;
  returns the IDs of the cards checked so far."
  [query checked-card-ids]
  (when (lib/any-native-stage? query)
    (throw (refusal (tru "A data app can run only queries built with the query builder, not SQL."))))
  (let [card-ids (set/difference (set (lib/all-source-card-ids query)) checked-card-ids)]
    (when-let [outside (some->> (not-empty card-ids)
                                data-apps.db/data-app-readable-card-ids
                                (set/difference card-ids)
                                not-empty)]
      (refuse-cards! query outside))
    (when-let [unpublished (queries/unpublished-read-table-names query)]
      (throw (refusal (tru "A data app can read only tables published to the Library, not {0}."
                           (str/join ", " (sort unpublished))))))
    (reduce (fn [checked card]
              (check-lib-query! (lib/query query (:dataset-query card)) checked))
            (into checked-card-ids card-ids)
            (some->> (not-empty card-ids) (lib.metadata/bulk-metadata query :metadata/card)))))

(defn- check-preprocessed-query!
  "Throws unless `query`, once the query processor has expanded its cards, segments, measures, parameters, remappings and
  foreign key reads into its stages and joins, runs no SQL and reads only tables published to the Library."
  [query]
  (let [preprocessed (try
                       (qp.setup/with-qp-setup [query query]
                         (qp.preprocess/preprocess query))
                       (catch Exception e
                         (throw (refusal (tru "A data app can run only valid queries.") e))))]
    (when (lib/any-native-stage? preprocessed)
      (throw (refusal (tru "A data app can run only queries built with the query builder, not SQL."))))
    (when-let [unpublished (some-> (not-empty (set (lib/all-source-table-ids preprocessed)))
                                   queries/unpublished-table-names
                                   not-empty)]
      (throw (refusal (tru "A data app can read only tables published to the Library, not {0}."
                           (str/join ", " (sort unpublished))))))))

(defenterprise check-query!
  "Throws a 403 unless `query`, a legacy or MBQL 5 query map, is an MBQL query on a database, without parameters, that
  reads only the Library."
  :feature :data-apps
  [query]
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
    (check-lib-query! query #{})
    (check-preprocessed-query! query))
  nil)

(defn- card-row
  "The ID and database ID of the card whose ID or entity ID is the route param `card-id`, or nil when there is none."
  [card-id]
  (if (= 21 (count card-id))
    (data-apps.db/card-by-entity-id card-id)
    (data-apps.db/card-by-id (parse-long card-id))))

(defenterprise check-card!
  "Throws a 403 unless the card with `card-id`, an ID or an entity ID, is a card of a data app or a metric in the Library
  whose query reads only the Library through MBQL, when such a card exists."
  :feature :data-apps
  [card-id]
  (when-let [{:keys [id database_id]} (card-row card-id)]
    (let [mp (lib-be/application-database-metadata-provider database_id)]
      (when-not (contains? (data-apps.db/data-app-readable-card-ids #{id}) id)
        (refuse-cards! mp #{id}))
      (let [card-query (lib/query mp (:dataset-query (lib.metadata/card mp id)))]
        (check-lib-query! card-query #{id})
        (check-preprocessed-query! card-query))))
  nil)

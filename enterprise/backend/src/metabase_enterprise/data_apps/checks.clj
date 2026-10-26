(ns metabase-enterprise.data-apps.checks
  "The checks that hold a data app's queries to its own cards and the Library: no SQL, source cards from the app's
  collection, published tables, Library metrics, and segments and measures of published tables."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
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

(defn- ids
  "`ids` in order, for an error message."
  [ids]
  (str/join ", " (sort ids)))

(defn- parse-query
  "`query`, a legacy or MBQL 5 query map, as an MBQL 5 query; throws a 403 unless it is a valid query on a database."
  [query]
  (when-not (and (map? query)
                 (pos-int? (:database query))
                 (data-apps.db/database-exists? (:database query)))
    (throw (refusal (tru "A data app can run only queries on a database."))))
  (try
    (lib/query (lib-be/application-database-metadata-provider (:database query)) query)
    (catch Exception e
      (throw (refusal (tru "A data app can run only valid queries.") e)))))

(defenterprise check-query
  "Throws a 403 unless `query`, a legacy or MBQL 5 query map, is an MBQL query whose source cards are cards of
  `data-app`, whose source tables are published to the Library, whose metrics are in the Library, and whose segments and
  measures are of published tables."
  :feature :data-apps
  [data-app query]
  (let [query      (parse-query query)
        metric-ids (lib/all-metric-ids query)
        card-ids   (not-empty (set/difference (set (lib/all-source-card-ids query)) metric-ids))]
    (when (lib/any-native-stage? query)
      (throw (refusal (tru "A data app can run only queries built with the query builder, not SQL."))))
    (when-let [external (some->> card-ids (data-apps.db/external-card-ids (:resource_collection_id data-app)) not-empty)]
      (throw (refusal (tru "A data app can use only the cards of its own app, not the cards {0}." (ids external)))))
    (when-let [external (some-> metric-ids data-apps.db/external-metric-ids not-empty)]
      (throw (refusal (tru "A data app can use only metrics from the Library, not the metrics {0}." (ids external)))))
    (when-let [external (some-> (lib/all-source-table-ids query) data-apps.db/external-table-ids not-empty)]
      (throw (refusal (tru "A data app can read only tables published to the Library, not the tables {0}."
                           (ids external)))))
    (when-let [external (some-> (lib/all-segment-ids query) data-apps.db/external-segment-ids not-empty)]
      (throw (refusal (tru "A data app can use only segments of tables published to the Library, not the segments {0}."
                           (ids external)))))
    (when-let [external (some-> (lib/all-measure-ids query) data-apps.db/external-measure-ids not-empty)]
      (throw (refusal (tru "A data app can use only measures of tables published to the Library, not the measures {0}."
                           (ids external))))))
  nil)

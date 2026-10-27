(ns metabase-enterprise.data-apps.checks
  "The checks that hold a data app's ad-hoc queries to its own cards and the Library: no native or internal queries,
  source cards from the app's collection, tables published to the Library, Library metrics, and segments and measures of
  published tables."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.data-apps.core :as data-apps]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- data-app-error
  "A 400 error for a data app's request that breaks a data app rule, with `message`."
  [message]
  (ex-info message {:status-code 400}))

(defenterprise request-data-app
  "The enabled data app, readable by the current user, whose slug a data-app `request` names by
  [[data-apps/data-app-slug]]; throws a 400 when it names none and a 404 when there is no such app."
  :feature :data-apps
  [request]
  (let [slug (or (data-apps/data-app-slug request)
                 (throw (data-app-error (tru "A data app request must name a data app on this instance."))))]
    (api/read-check (data-apps.db/enabled-data-app-by-slug slug))))

(defn- format-ids
  "`ids` in order, for an error message."
  [ids]
  (str/join ", " (sort ids)))

(defenterprise-schema check-query :- :nil
  "Throws a 400 unless `query`, as the `/api/dataset` endpoints normalize it, is neither internal nor native and uses only
  cards in `data-app`'s collection, tables published to the Library (joins included), Library metrics, and segments and
  measures of published tables."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app
   query    :- ::lib-be.schema/maybe-legacy-or-internal-query]
  (when (= :internal (keyword (:type query)))
    (throw (data-app-error (tru "A data app cannot run internal queries."))))
  (let [metric-ids (lib/all-metric-ids query)
        card-ids   (not-empty (set/difference (set (lib/all-source-card-ids query)) metric-ids))]
    (when (lib/any-native-stage? query)
      (throw (data-app-error (tru "A data app cannot run native queries."))))
    (when-let [external (some->> card-ids (data-apps.db/external-card-ids (:resource_collection_id data-app)) not-empty)]
      (throw (data-app-error (tru "A data app can use only the cards in its own collection, not the cards {0}." (format-ids external)))))
    (when-let [external (some-> metric-ids data-apps.db/external-metric-ids not-empty)]
      (throw (data-app-error (tru "A data app can use only metrics from the Library, not the metrics {0}." (format-ids external)))))
    (when-let [external (some-> (lib/all-source-table-ids query) data-apps.db/external-table-ids not-empty)]
      (throw (data-app-error (tru "A data app can read only tables published to the Library, not the tables {0}."
                                  (format-ids external)))))
    (when-let [external (some-> (lib/all-segment-ids query) data-apps.db/external-segment-ids not-empty)]
      (throw (data-app-error (tru "A data app can use only segments of tables published to the Library, not the segments {0}."
                                  (format-ids external)))))
    (when-let [external (some-> (lib/all-measure-ids query) data-apps.db/external-measure-ids not-empty)]
      (throw (data-app-error (tru "A data app can use only measures of tables published to the Library, not the measures {0}."
                                  (format-ids external))))))
  nil)

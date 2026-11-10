(ns metabase-enterprise.data-apps.checks
  "The checks on the requests through which a data app runs queries and actions. A dev preview, which has no app on the
  instance, builds on no card and runs ad-hoc implicit actions; an app builds only on the cards and runs only the
  actions in its collection."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.api.common :as api]
   [metabase.data-apps.core :as data-apps]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- data-app-error
  "A 400 error for a data app's request that breaks a data app rule, with `message`."
  [message]
  (ex-info message {:status-code 400}))

(defenterprise request-data-app
  "What a data-app `request` is checked as: the app its slug names by [[data-apps/data-app-slug]], read-checked, so a
  missing app is a 404 and an unreadable one a 403, or, for a dev preview's request, a preview of the app its slug
  names, whether the app exists or not; nil for a request that is not a data app's."
  :feature :data-apps
  [request]
  (when (data-apps/data-app-request? request)
    (let [slug (data-apps/data-app-slug request)]
      (if (data-apps/data-app-dev-request? request)
        {:slug (api/check-404 slug)}
        (api/read-check (some-> slug data-apps.db/data-app-by-slug))))))

(defn- app-collection-id
  "The ID of the collection of the app `data-app`, or nil for a dev preview or an app without one."
  [data-app]
  (:resource_collection_id data-app))

(defn- preview?
  "Whether `data-app` is a dev preview, which has no ID."
  [data-app]
  (not (contains? data-app :id)))

(defn- format-ids
  "`ids` in order, for an error message."
  [ids]
  (str/join ", " (sort ids)))

(defn- in-app-collection?
  "Whether `entity` is in `data-app`'s collection."
  [data-app entity]
  (let [collection-id (app-collection-id data-app)]
    (and (some? collection-id) (= collection-id (:collection_id entity)))))

(defn- check-preview-query
  "Throws a 400 if `query`, a dev preview's MBQL query, builds on a card; its metrics, like everything else, may be any."
  [query]
  (when-let [card-ids (not-empty (set/difference (set (lib/all-source-card-ids query)) (set (lib/all-metric-ids query))))]
    (throw (data-app-error (tru "A data app''s dev preview cannot build on cards, not the cards {0}." (format-ids card-ids))))))

(defn- check-app-query
  "Throws a 400 unless `query`, an app's MBQL query, builds only on the cards in the app's collection, reading no table,
  segment, measure or metric."
  [data-app query]
  (when-let [ids (lib/all-source-table-ids query)]
    (throw (data-app-error (tru "A data app cannot read tables, not the tables {0}." (format-ids ids)))))
  (when-let [ids (lib/all-segment-ids query)]
    (throw (data-app-error (tru "A data app cannot use segments, not the segments {0}." (format-ids ids)))))
  (when-let [ids (lib/all-measure-ids query)]
    (throw (data-app-error (tru "A data app cannot use measures, not the measures {0}." (format-ids ids)))))
  (when-let [ids (lib/all-metric-ids query)]
    (throw (data-app-error (tru "A data app cannot use metrics, not the metrics {0}." (format-ids ids)))))
  (when-let [external (some->> (lib/all-source-card-ids query)
                               (data-apps.db/external-card-ids (app-collection-id data-app))
                               not-empty)]
    (throw (data-app-error (tru "A data app can use only the cards in its own collection, not the cards {0}."
                                (format-ids external))))))

(defenterprise-schema check-adhoc-query :- :nil
  "Throws a 400 unless `data-app` may run `query`, as the `/api/dataset` endpoints normalize it: no internal or native
  query, a dev preview's query that builds on no card, or an app's that builds only on the cards in its collection."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   query    :- ::lib-be.schema/maybe-legacy-or-internal-query]
  (when (= :internal (keyword (:type query)))
    (throw (data-app-error (tru "A data app cannot run internal queries."))))
  (when (lib/any-native-stage? query)
    (throw (data-app-error (tru "A data app cannot run native queries."))))
  (if (preview? data-app)
    (check-preview-query query)
    (check-app-query data-app query))
  nil)

(defenterprise-schema check-card :- :nil
  "Throws a 400 unless `data-app` is an app and the card with `card-id` is in its collection, after a read check of the
  card; a dev preview runs no saved card."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   card-id  :- ::lib.schema.id/card]
  (let [card (api/read-check :model/Card card-id)]
    (when (preview? data-app)
      (throw (data-app-error (tru "A data app''s dev preview cannot run saved cards, not the card {0}." (str card-id)))))
    (when-not (in-app-collection? data-app card)
      (throw (data-app-error (tru "A data app can run only the cards in its own collection, not the card {0}."
                                  (str card-id))))))
  nil)

(defenterprise-schema check-action :- :nil
  "Throws a 400 unless `data-app` is an app and the action with `action-id` is in its collection, after a read check of
  the action; a dev preview runs ad-hoc actions alone."
  :feature :data-apps
  [data-app  :- ::data-apps.schema/data-app-info
   action-id :- ::lib.schema.id/action]
  (when (preview? data-app)
    (throw (data-app-error (tru "A data app''s dev preview can run only ad-hoc actions, not the action {0}." (str action-id)))))
  (when-not (in-app-collection? data-app (api/read-check :model/Action action-id))
    (throw (data-app-error (tru "A data app can run only the actions in its own collection, not the action {0}."
                                (str action-id)))))
  nil)

(defenterprise-schema check-adhoc-action :- :nil
  "Throws a 400 unless `data-app` is a dev preview and the ad-hoc `action` is an HTTP action of no model or an implicit
  action of no model on a table."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   action   :- ::actions.schema/action.adhoc]
  (when-not (preview? data-app)
    (throw (data-app-error (tru "A data app can run only the actions in its own collection, not ad-hoc ones."))))
  (when-not (and (nil? (:model_id action))
                 (case (keyword (:type action))
                   :http     true
                   :implicit (some? (:table_id action))
                   false))
    (throw (data-app-error (tru "A data app''s dev preview can run only HTTP actions and implicit actions on a table."))))
  nil)

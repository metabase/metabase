(ns metabase-enterprise.data-apps.checks
  "The checks that hold a data app's requests to the Library and its own collection. A dev preview, which has no app on
  the instance, uses Library metrics but no saved card and runs ad-hoc implicit actions; an app may also use the cards
  and run the actions in its collection."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
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

(defenterprise-schema check-adhoc-query :- :nil
  "Throws a 400 unless `query`, as the `/api/dataset` endpoints normalize it, is an MBQL query without explicit joins or
  custom columns that uses only Library metrics; an app's query may also build on the cards in its collection."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   query    :- ::lib-be.schema/maybe-legacy-or-internal-query]
  (when (= :internal (keyword (:type query)))
    (throw (data-app-error (tru "A data app cannot run internal queries."))))
  (when (lib/any-native-stage? query)
    (throw (data-app-error (tru "A data app cannot run native queries."))))
  (when (some #(seq (lib/joins query %)) (range (lib/stage-count query)))
    (throw (data-app-error (tru "A data app cannot run queries that join tables explicitly."))))
  (when (some #(seq (lib/expressions query %)) (range (lib/stage-count query)))
    (throw (data-app-error (tru "A data app cannot run queries with custom columns."))))
  (let [metric-ids (lib/all-metric-ids query)
        card-ids   (set/difference (set (lib/all-source-card-ids query)) metric-ids)]
    (when (seq card-ids)
      (when (preview? data-app)
        (throw (data-app-error (tru "A data app''s dev preview cannot build on cards, not the cards {0}." (format-ids card-ids)))))
      (when-let [external (not-empty (data-apps.db/external-card-ids (app-collection-id data-app) card-ids))]
        (throw (data-app-error (tru "A data app can use only the cards in its own collection, not the cards {0}."
                                    (format-ids external))))))
    (when-let [external (some-> metric-ids data-apps.db/external-metric-ids not-empty)]
      (throw (data-app-error (tru "A data app can use only metrics from the Library, not the metrics {0}." (format-ids external))))))
  nil)

(defenterprise-schema check-card :- :nil
  "Throws a 400 unless the card with `card-id` is a Library metric, or `data-app` is an app and the card is in its
  collection, after a read check of the card; a dev preview uses no saved card but Library metrics."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   card-id  :- ::lib.schema.id/card]
  (let [card (api/read-check :model/Card card-id)]
    (when (seq (data-apps.db/external-metric-ids #{card-id}))
      (when (preview? data-app)
        (throw (data-app-error (tru "A data app''s dev preview cannot use saved cards but Library metrics, not the card {0}."
                                    (str card-id)))))
      (when-not (in-app-collection? data-app card)
        (throw (data-app-error (tru "A data app can use only the cards in its own collection and Library metrics, not the card {0}."
                                    (str card-id)))))))
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
  "Throws a 400 unless `data-app` is a dev preview and the ad-hoc `action` is an implicit action of no model on a table."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   action   :- ::actions.schema/action.adhoc]
  (when-not (preview? data-app)
    (throw (data-app-error (tru "A data app can run only the actions in its own collection, not ad-hoc ones."))))
  (when-not (and (= :implicit (keyword (:type action))) (nil? (:model_id action)) (:table_id action))
    (throw (data-app-error (tru "A data app''s dev preview can run only implicit actions on a table."))))
  nil)

(defenterprise-schema data-app-actions :- [:sequential ::actions.schema/action]
  "The `actions` in `data-app`'s collection."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app-info
   actions  :- [:sequential ::actions.schema/action]]
  (filterv (partial in-app-collection? data-app) actions))

(def ^:private sdk-user-key-values
  "The user key-values, as `[namespace key]`, that the SDK reads and writes inside a data app."
  #{["last_download_format" "download_format_preference"]})

(defenterprise-schema check-user-key-value :- :nil
  "Throws a 400 unless the user key-value `k` in `nmspace` is one the SDK uses inside a data app."
  :feature :data-apps
  [_data-app :- ::data-apps.schema/data-app-info
   nmspace   :- :string
   k         :- :string]
  (when-not (contains? sdk-user-key-values [nmspace k])
    (throw (data-app-error (tru "A data app can use only the user key-values of the SDK, not the key {0} in the namespace {1}."
                                k nmspace))))
  nil)

(defenterprise-schema data-app-collection-types :- [:maybe [:set :string]]
  "The types of the Library and of its collections, which their subcollections inherit."
  :feature :data-apps
  [_data-app :- ::data-apps.schema/data-app-info]
  collections/library-collection-types)

(defenterprise-schema check-collection :- :nil
  "Throws a 400 unless the collection with `collection-id` is of a type in [[data-app-collection-types]], after a read
  check of the collection."
  :feature :data-apps
  [data-app      :- ::data-apps.schema/data-app-info
   collection-id :- ::lib.schema.id/collection]
  (when-not (contains? (data-app-collection-types data-app) (:type (api/read-check :model/Collection collection-id)))
    (throw (data-app-error (tru "A data app can see only the Library and its collections, not the collection {0}."
                                (str collection-id)))))
  nil)

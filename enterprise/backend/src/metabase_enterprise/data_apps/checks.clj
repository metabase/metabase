(ns metabase-enterprise.data-apps.checks
  "The checks that hold a data app's ad-hoc queries and card runs to its own cards and the Library, and its action runs
  to the actions in its collection: no native or internal queries, cards from the app's collection, tables published to
  the Library, Library metrics, segments and measures of published tables, and actions from the app's collection."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.data-apps.core :as data-apps]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- data-app-error
  "A 400 error for a data app's request that breaks a data app rule, with `message`."
  [message]
  (ex-info message {:status-code 400}))

(defenterprise request-data-app
  "The data app whose slug a data-app `request` names by [[data-apps/data-app-slug]], read-checked, so a missing app is
  a 404 and an unreadable one a 403; nil for a request that is not a data app's."
  :feature :data-apps
  [request]
  (when (data-apps/data-app-request? request)
    (api/read-check (some-> (data-apps/data-app-slug request) data-apps.db/data-app-by-slug))))

(defn- format-ids
  "`ids` in order, for an error message."
  [ids]
  (str/join ", " (sort ids)))

(defn- in-app-collection?
  "Whether `entity` is in `data-app`'s collection."
  [data-app entity]
  (let [collection-id (:resource_collection_id data-app)]
    (and (some? collection-id) (= collection-id (:collection_id entity)))))

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
        card-ids   (set/difference (set (lib/all-source-card-ids query)) metric-ids)]
    (when (lib/any-native-stage? query)
      (throw (data-app-error (tru "A data app cannot run native queries."))))
    (when-let [external (some->> (not-empty card-ids)
                                 (data-apps.db/external-card-ids (:resource_collection_id data-app))
                                 not-empty)]
      (throw (data-app-error (tru "A data app can use only the cards in its own collection, not the cards {0}."
                                  (format-ids external)))))
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

(defn- in-library?
  "Whether `entity` is in the Library or one of its collections."
  [entity]
  (contains? collections/library-collection-types (-> entity (t2/hydrate :collection) :collection :type)))

(defn- read-checked-app-card
  "The card with `card-id`, after a read check; throws a 400 unless it is in `data-app`'s collection or in the Library."
  [data-app card-id]
  (let [card (api/read-check :model/Card card-id)]
    (when-not (or (in-app-collection? data-app card) (in-library? card))
      (throw (data-app-error (tru "A data app can use only the cards in its own collection and in the Library, not the card {0}."
                                  (str card-id)))))
    card))

(defn- check-values-source-card
  "Throws a 400 unless the card with `card-id` is one `data-app` may use and not a dashboard question, after a read
  check of the card."
  [data-app card-id]
  (when (:dashboard_id (read-checked-app-card data-app card-id))
    (throw (data-app-error (tru "A data app cannot take parameter values from the dashboard question {0}." (str card-id))))))

(defenterprise-schema check-card :- :nil
  "Throws a 400 unless the card with `card-id` is in `data-app`'s collection or in the Library, after a read check of
  the card."
  :feature :data-apps
  [data-app :- ::data-apps.schema/data-app
   card-id  :- ::lib.schema.id/card]
  (read-checked-app-card data-app card-id)
  nil)

(defn- published-table?
  "Whether the table with `table-id` is published to the Library."
  [table-id]
  (empty? (data-apps.db/external-table-ids #{table-id})))

(defn- check-published-field
  "Throws a 400 unless the field with `field-id` belongs to a table published to the Library, after a read check of
  the field."
  [field-id]
  (when-not (published-table? (:table_id (api/read-check :model/Field field-id)))
    (throw (data-app-error (tru "A data app can read only fields of tables published to the Library, not the field {0}."
                                (str field-id))))))

(defenterprise-schema check-card-parameter :- :nil
  "Throws a 400 unless the card with `card-id` is in `data-app`'s collection or the Library and its parameter
  `param-key` takes its values from a static list, such a card other than a dashboard question, or a field of a table
  published to the Library, after read checks of each."
  :feature :data-apps
  [data-app  :- ::data-apps.schema/data-app
   card-id   :- ::lib.schema.id/card
   param-key :- ::lib.schema.parameter/id]
  (let [card      (read-checked-app-card data-app card-id)
        parameter (some #(when (= param-key (:id %)) %) (:parameters card))]
    (case (some-> (:values_source_type parameter) keyword)
      :static-list nil
      :card        (some->> (get-in parameter [:values_source_config :card_id]) (check-values-source-card data-app))
      (some-> (params/param-target->field-id (:target parameter) card) check-published-field)))
  nil)

(defenterprise-schema check-parameter :- :nil
  "Throws a 400 unless the ad-hoc `parameter` takes its values from a static list, a card `data-app` may use other than
  a dashboard question, or the fields with `field-ids`, each of a table published to the Library, after read checks
  of each."
  :feature :data-apps
  [data-app  :- ::data-apps.schema/data-app
   parameter :- ::parameters.schema/parameter
   field-ids :- [:maybe [:sequential ::lib.schema.id/field]]]
  (case (some-> (:values_source_type parameter) keyword)
    :static-list nil
    :card        (some->> (get-in parameter [:values_source_config :card_id]) (check-values-source-card data-app))
    (run! check-published-field field-ids))
  nil)

(defenterprise-schema check-action :- :nil
  "Throws a 400 unless the action with `action-id` is in `data-app`'s collection, after a read check of the action."
  :feature :data-apps
  [data-app  :- ::data-apps.schema/data-app
   action-id :- ::lib.schema.id/action]
  (when-not (in-app-collection? data-app (api/read-check :model/Action action-id))
    (throw (data-app-error (tru "A data app can run only the actions in its own collection, not the action {0}."
                                action-id))))
  nil)

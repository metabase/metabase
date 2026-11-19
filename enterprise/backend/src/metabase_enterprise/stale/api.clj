(ns metabase-enterprise.stale.api
  "API endpoints for retrieving or archiving stale (unused) items.
  Currently supports Dashboards and Cards."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.stale.db :as stale.db]
   [metabase-enterprise.stale.impl :as stale]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.staleness.core :as staleness]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(defn- effective-children-ids
  "The ids of the unarchived descendants of `collection` the current user writes, answered together."
  [collection]
  (let [ids (into [] (comp (map :id) (remove #(= % (collection/trash-collection-id))))
                  (collection/descendants-flat collection false))]
    (filterv (collection/visible-collection-ids ids :write) ids)))

(defn- present-model-items
  "The API items of the stale rows of `model`, in no particular order: `present-items` keeps their order."
  [model rows]
  (let [{:keys [load render]} (staleness/spec model)]
    (map render (load (into #{} (map :id) rows)))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/:id" :id #"(?:\d+)|(?:root)"]
  "A flexible endpoint that returns stale entities, in the same shape as collections/items, with the following options:
  - `before_date` - only return entities that were last edited before this date (default: 6 months ago)
  - `is_recursive` - if true, return entities from all children of the collection, not just the direct children (default: false)
  - `sort_column` - the column to sort by (default: name)
  - `sort_direction` - the direction to sort by (default: asc)"
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt [:= :root]]]]
   {:keys [before_date is_recursive sort_column sort_direction]} :- [:map {:closed true}
                                                                     [:before_date    {:optional true}  [:maybe :string]]
                                                                     [:is_recursive   {:default false}  :boolean]
                                                                     [:sort_column    {:default :name}  [:enum :name :last_used_at]]
                                                                     [:sort_direction {:default :asc}   [:enum :asc :desc]]]]
  (premium-features/assert-has-feature :collection-cleanup (tru "Collection Cleanup"))
  (let [before-date    (if before_date
                         (try (t/local-date "yyyy-MM-dd" before_date)
                              (catch Exception _
                                (throw (ex-info (str "invalid before_date: '"
                                                     before_date
                                                     "' expected format: 'yyyy-MM-dd'")
                                                {:status-code 400}))))
                         (t/minus (t/local-date) (t/months 6)))
        collection     (if (= id :root)
                         collection/root-collection
                         (stale.db/collection id))
        _              (api/read-check collection)
        collection-ids (->> (if is_recursive
                              (conj (effective-children-ids collection)
                                    id)
                              [id])
                            (mapv (fn root->nil [x] (if (= :root x) nil x)))
                            set)

        {:keys [total rows]}
        (stale/find-candidates {:collection-ids collection-ids
                                :cutoff-date    before-date
                                :limit          (request/limit)
                                :offset         (request/offset)
                                :sort-column    sort_column
                                :sort-direction sort_direction})

        snowplow-payload {:event                   :stale-items-read
                          :collection_id           (when-not (= :root id) id)
                          :total_stale_items_found total
                          ;; convert before-date to a date-time string before sending it.
                          :cutoff_date             (format "%sT00:00:00Z" (str before-date))}]
    (analytics/track-event! :snowplow/cleanup snowplow-payload)
    {:total  total
     :data   (api/present-items present-model-items rows)
     :limit  (request/limit)
     :offset (request/offset)}))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for Stale API"
  (api.macros/ns-handler *ns* +auth))

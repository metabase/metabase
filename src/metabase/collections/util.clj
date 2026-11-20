(ns metabase.collections.util
  (:require
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]))

(defn annotate-dashboards
  "Populates 'here' on dashboards (`below` is impossible since they can't contain collections)"
  [dashboards]
  (let [dashboard-ids (into #{} (map :id dashboards))
        dashboards-containing-cards (->> (when (seq dashboard-ids)
                                           (collections.db/dashboard-ids-with-cards dashboard-ids))
                                         (map :dashboard_id)
                                         (into #{}))]
    (for [dashboard dashboards]
      (cond-> dashboard
        (contains? dashboards-containing-cards (:id dashboard))
        (assoc :here #{:card})))))

(defn with-effective-ancestors
  "Adds to each of `rows` the effective ancestors of its `:collection`, for [[present-collection]]: the ancestors the
  user can read, fetching those that no row carries in one query. Each `:collection` is hydrated with `:effective_location`."
  [rows]
  (let [coll-id->coll (into {} (for [{coll :collection} rows
                                     :when (some? coll)]
                                 [(:id coll) coll]))
        to-fetch      (into #{} (comp (keep :effective_location)
                                      (mapcat collection/location-path->ids)
                                      (remove coll-id->coll))
                            (vals coll-id->coll))
        coll-id->coll (merge (if (seq to-fetch)
                               (collections.db/collections-by-id (vec to-fetch))
                               {})
                             coll-id->coll)]
    (for [row rows]
      (cond-> row
        (some? (:collection row))
        (assoc ::effective-ancestors
               (if-let [loc (:effective_location (:collection row))]
                 (->> (collection/location-path->ids loc)
                      (map coll-id->coll)
                      (mapv #(select-keys % [:id :name :authority_level :type])))
                 []))))))

(defn present-collection
  "`row` with its `:collection` reduced to what the API shows of it, and the ancestors [[with-effective-ancestors]] added."
  [row]
  (let [{:keys [id name authority_level type]} (:collection row)]
    (-> row
        (dissoc ::effective-ancestors)
        (assoc :collection {:id                  id
                            :name                name
                            :authority_level     authority_level
                            :type                type
                            :effective_ancestors (or (::effective-ancestors row) [])}))))

(ns metabase-enterprise.audit-app.pages.dashboard-subscriptions
  (:require
   [clojure.string :as str]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.pages.common.pulses :as common.pulses]
   [metabase.util :as u]))

(def ^:private table-metadata
  (into
   [[:dashboard_id   {:display_name "Dashboard ID",  :base_type :type/Integer, :remapped_to :dashboard_name}]
    [:dashboard_name {:display_name "Dashboard Name" :base_type :type/Text,    :remapped_from :dashboard_id}]]
   common.pulses/table-metadata))

(def ^:private table-query-columns
  (into
   [:dashboard_id
    :dashboard_name]
   common.pulses/table-query-columns))

(defn- table-query [dashboard-name]
  (-> common.pulses/table-query
      (update :select (partial into
                               [[:dashboard.id :dashboard_id]
                                [:dashboard.name :dashboard_name]]))
      (update :left-join into [[:report_dashboard :dashboard] [:= :pulse.dashboard_id :dashboard.id]])
      (update :where (fn [where]
                       (into
                        where
                        (filter some?)
                        [[:not= :pulse.dashboard_id nil]
                         (when-not (str/blank? dashboard-name)
                           [:like [:lower :dashboard.name] (str \% (u/lower-case-en dashboard-name) \%)])])))
      (assoc :order-by [[[:lower :dashboard.name] :asc]
                        ;; Newest first. ID instead of `created_at` because the column is currently only
                        ;; second-resolution for MySQL which busts our tests
                        [:channel.id :desc]])))

(def ^:private ^{:arglists '([row-map])} row-map->vec
  (apply juxt (map first table-metadata)))

(defn- post-process-row [row]
  (-> (zipmap table-query-columns row)
      common.pulses/post-process-row-map
      row-map->vec))

;; with optional param `dashboard-name`, only show subscriptions matching dashboard name.
(defmethod audit.i/internal-query ::table
  ([query-type]
   (audit.i/internal-query query-type nil))

  ([_ dashboard-name]
   {:metadata table-metadata
    :results  (common/reducible-query (table-query dashboard-name))
    :xform    (map post-process-row)}))

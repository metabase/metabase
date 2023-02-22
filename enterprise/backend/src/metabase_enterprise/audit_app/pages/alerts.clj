(ns metabase-enterprise.audit-app.pages.alerts
  (:require
   [clojure.string :as str]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.pages.common.pulses :as common.pulses]
   [metabase.util :as u]))

(def ^:private table-metadata
  (into
   [[:card_id   {:display_name "Question ID",  :base_type :type/Integer, :remapped_to :card_name}]
    [:card_name {:display_name "Question Name" :base_type :type/Text,    :remapped_from :card_id}]]
   common.pulses/table-metadata))

(def ^:private table-query-columns
  (into
   [:card_id
    :card_name]
   common.pulses/table-query-columns))

(defn- table-query [card-name]
  (-> common.pulses/table-query
      (update :select (partial into
                               [[:card.id :card_id]
                                [:card.name :card_name]]))
      (update :left-join into [:pulse_card          [:= :pulse.id :pulse_card.pulse_id]
                               [:report_card :card] [:= :pulse_card.card_id :card.id]])
      (update :where (fn [where]
                       (into
                        where
                        (filter some?)
                        ;; make sure the pulse_card actually exists.
                        [[:not= :pulse_card.card_id nil]
                         [:= :pulse.dashboard_id nil]
                         ;; if `pulse.alert_condition` is non-NULL then the Pulse is an Alert
                         [:not= :pulse.alert_condition nil]
                         (when-not (str/blank? card-name)
                           [:like [:lower :card.name] (str \% (u/lower-case-en card-name) \%)])])))
      (assoc :order-by [[[:lower :card.name] :asc]
                        ;; Newest first. ID instead of `created_at` because the column is currently only
                        ;; second-resolution for MySQL which busts our tests
                        [:channel.id :desc]])))

(def ^:private ^{:arglists '([row-map])} row-map->vec
  (apply juxt (map first table-metadata)))

(defn- post-process-row [row]
  (-> (zipmap table-query-columns row)
      common.pulses/post-process-row-map
      row-map->vec))

;; with optional param `card-name`, only show subscriptions matching card name.
(defmethod audit.i/internal-query ::table
  ([query-type]
   (audit.i/internal-query query-type nil))

  ([_ card-name]
   {:metadata table-metadata
    :results  (common/reducible-query (table-query card-name))
    :xform    (map post-process-row)}))

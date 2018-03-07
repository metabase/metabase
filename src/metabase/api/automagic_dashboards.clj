(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :as magic]
             [comparison :as magic.comparison]]
            [metabase.models
             [dashboard :refer [Dashboard] :as dashboard]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint GET "/table/:id"
  "Return an automagic dashboard for table with id `ìd`."
  [id]
  (first (magic/automagic-dashboard (Table id))))

(api/defendpoint GET "/analize/metric/:id"
  "Return an automagic dashboard analyzing metric with id `id`."
  [id]
  (magic/automagic-analysis (Metric id)))

(def ^:private valid-comparison-pair?
  #{["segment" "segment"]
    ["segment" "table"]
    ["segment" "adhoc"]
    ["table" "segment"]
    ["table" "adhoc"]
    ["adhoc" "table"]
    ["adhoc" "segment"]
    ["adhoc" "adhoc"]})

(defmulti
  ^{:private true
    :doc "Turn `x` into segment-like."
    :arglists '([x])}
  ->segment (comp keyword :type))

(defmethod ->segment :table
  [_]
  {:name "entire dataset"})

(defmethod ->segment :segment
  [{:keys [id]}]
  (-> id
      Segment
      api/check-404
      (update :name (partial str "segment "))))

(defmethod ->segment :adhoc
  [{:keys [filter name]}]
  {:definition {:filter filter}
   :name       (or name "adhoc segment")})

(api/defendpoint POST "/compare"
  "Return an automagic comparison dashboard based on given dashboard."
  [:as {{:keys [dashboard left right]} :body}]
  (api/check-404 (valid-comparison-pair? (map :type [left right])))
  (magic.comparison/comparison-dashboard (if (number? dashboard)
                                           (-> (Dashboard dashboard)
                                               api/check-404
                                               (hydrate [:ordered_cards
                                                         [:card :in_public_dashboard]
                                                         :series]))
                                           dashboard)
                                         (->segment left)
                                         (->segment right)))

;; ----------------------------------------- for testing convinience ----------------

(api/defendpoint GET "/database/:id/save"
  "Create automagic dashboards for all visible tables in database with id `ìd`."
  [id]
  (->> (magic/candidate-tables id)
       (mapcat magic/automagic-dashboard)
       (map (comp :id dashboard/save-transient-dashboard!))))

(api/defendpoint GET "/table/:id/save"
  "Create an automagic dashboard for table with id `ìd`."
  [id]
  (->> (magic/automagic-dashboard (Table id))
       (map (comp :id dashboard/save-transient-dashboard!))))

(api/defendpoint GET "/analize/metric/:id/save"
  "Create an automagic dashboard analyzing metric with id `id`."
  [id]
  [(-> (magic/automagic-analysis (Metric id))
       dashboard/save-transient-dashboard!
       :id)])

(api/defendpoint GET "/compare/dashboard/:dashboard-id/segments/:left-id/:right-id/save"
  "Create an automagic comparison dashboard based on dashboard with ID
   `dashboard-id`, comparing segments with IDs `left-id` and `right-id`."
  [dashboard-id left-id right-id]
  [(-> (Dashboard dashboard-id)
       api/check-404
       (hydrate [:ordered_cards [:card :in_public_dashboard] :series])
       (magic.comparison/comparison-dashboard (Segment left-id) (Segment right-id))
       dashboard/save-transient-dashboard!
       :id)])

(api/define-routes)

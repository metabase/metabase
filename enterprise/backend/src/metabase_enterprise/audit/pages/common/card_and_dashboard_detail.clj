(ns metabase-enterprise.audit.pages.common.card-and-dashboard-detail
  "Common queries used by both Card (Question) and Dashboard detail pages."
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [revision :as revision]]
            [metabase.util
             [honeysql-extensions :as hx]
             [schema :as su]]
            [schema.core :as s]))

(def ^:private ModelName
  (s/enum "card" "dashboard"))

;; SELECT {{group-fn(timestamp}} AS "date", count(*) AS views
;; FROM view_log
;; WHERE model = {{model}}
;;   AND model_id = {{model-id}}
;; GROUP BY {{group-fn(timestamp}}
;; ORDER BY {{group-fn(timestamp}} ASC
(s/defn views-by-time
  "Get views of a Card or Dashboard broken out by a time `unit`, e.g. `day` or `day-of-week`."
  [model :- ModelName, model-id :- su/IntGreaterThanZero, unit :- common/DateTimeUnitStr]
  {:metadata [[:date  {:display_name "Date",  :base_type (common/datetime-unit-str->base-type unit)}]
              [:views {:display_name "Views", :base_type :type/Integer}]]
   :results (let [grouped-timestamp (common/grouped-datetime unit :timestamp)]
              (common/reducible-query
               {:select   [[grouped-timestamp :date]
                           [:%count.* :views]]
                :from     [:view_log]
                :where    [:and
                           [:= :model (hx/literal model)]
                           [:= :model_id model-id]]
                :group-by [grouped-timestamp]
                :order-by [[grouped-timestamp :asc]]}))})

(s/defn revision-history
  "Get a revision history table for a Card or Dashboard."
  [model-entity :- (s/cond-pre (class Card) (class Dashboard)), model-id :- su/IntGreaterThanZero]
  {:metadata [[:timestamp   {:display_name "Edited on",   :base_type :type/DateTime}]
              [:user_id     {:display_name "User ID",     :base_type :type/Integer, :remapped_to   :user_name}]
              [:user_name   {:display_name "Edited by",   :base_type :type/Name,    :remapped_from :user_id}]
              [:change_made {:display_name "Change made", :base_type :type/Text}]
              [:revision_id {:display_name "Revision ID", :base_type :type/Integer}]]
   :results (for [revision (revision/revisions+details model-entity model-id)]
              {:timestamp   (-> revision :timestamp)
               :user_id     (-> revision :user :id)
               :user_name   (-> revision :user :common_name)
               :change_made (-> revision :description)
               :revision_id (-> revision :id)})})

(s/defn audit-log
  "Get a view log for a Card or Dashboard."
  [model :- ModelName, model-id :- su/IntGreaterThanZero]
  {:metadata [[:when    {:display_name "When",    :base_type :type/DateTime}]
              [:user_id {:display_name "User ID", :base_type :type/Integer, :remapped_to   :who}]
              [:who     {:display_name "Who",     :base_type :type/Name,    :remapped_from :user_id}]]
   :results (common/reducible-query
              {:select    [[:vl.timestamp :when]
                           :vl.user_id
                           [(common/user-full-name :u) :who]]
               :from      [[:view_log :vl]]
               :join     [[:core_user :u] [:= :vl.user_id :u.id]]
               :where     [:and
                           [:= :model (hx/literal model)]
                           [:= :model_id model-id]]
               :order-by  [[:vl.timestamp :desc]
                           [:%lower.u.last_name :asc]
                           [:%lower.u.first_name :asc]]})})

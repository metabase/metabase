(ns metabase.models.revision.last-edit
  "A namespace to handle getting the last edited information about items that satisfy the revision system. The revision
  system is a 'reversion' system, built to easily revert to previous states and can compute on demand a changelog. The
  revision system works through events and so when editing something, you should construct the last-edit-info
  yourself (using `edit-information-for-user`) rather looking at the revision table which might not be updated yet.

  This constructs `:last-edit-info`, a map with keys `:timestamp`, `:id`, `:first_name`, `:last_name`, and
  `:email`. It is not a full User object (missing some superuser metadata, last login time, and a common name). This
  was done to prevent another db call and hooking up timestamps to users but this can be added if preferred."
  (:require
   [clj-time.core :as time]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(def ^:private model->db-model {:card "Card" :dashboard "Dashboard"})

;; these are all maybes as sometimes revisions don't exist, or users might be missing the names, etc
(def ^:private LastEditInfo
  "Schema of the `:last-edit-info` map. A subset of a user with a timestamp indicating when the last edit was."
  [:map
   [:timestamp  [:maybe :any]]
   [:id         [:maybe ms/PositiveInt]]
   [:first_name [:maybe :string]]
   [:last_name  [:maybe :string]]
   [:email      [:maybe :string]]])

(def MaybeAnnotated
  "Spec for an item annotated with last-edit-info. Items are cards or dashboards. Optional because we may not always
  have revision history for all cards/dashboards."
  [:map
   [:last-edit-info {:optional true} LastEditInfo]])

(mu/defn with-last-edit-info :- [:maybe [:sequential MaybeAnnotated]]
  "Add the last edited information to a card. Will add a key `:last-edit-info`. Model should be one of `:dashboard` or
  `:card`. Gets the last edited information from the revisions table. If you need this information from a put route,
  use `@api/*current-user*` and a current timestamp since revisions are events and asynchronous."
  [items
   model :- [:enum :dashboard :card]]
  (let [ids (into #{} (map :id) items)]
    (span/with-span!
      {:name       "with-last-edit-info"
       :attributes {:item/ids ids}}
      (when (seq ids)
        (let [id->updated-info
              (reduce (fn [m card-updated-info]
                        (assoc m
                               (:model_id card-updated-info)
                               (select-keys card-updated-info [:id :email :first_name :last_name :timestamp])))
                      {}
                      (t2/reducible-query
                       {:select    [:r.model_id :u.id :u.email :u.first_name :u.last_name :r.timestamp]
                        :from      [[:revision :r]]
                        :left-join [[:core_user :u] [:= :u.id :r.user_id]]
                        :where     [:and
                                    [:= :r.most_recent true]
                                    [:= :r.model (model->db-model model)]
                                    [:in :r.model_id ids]]}))]
          (map (fn [item]
                 (m/assoc-some item :last-edit-info (-> item :id id->updated-info)))
               items))))))

(mu/defn edit-information-for-user :- LastEditInfo
  "Construct the `:last-edit-info` map given a user. Useful for editing routes. Most edit info information comes from
  the revisions table. But this table is populated from events asynchronously so when editing and wanting
  last-edit-info, you must construct it from `@api/*current-user*` and the current timestamp rather than checking the
  revisions table as those revisions may not be present yet."
  [user]
  (merge {:timestamp (time/now)}
         (select-keys user [:id :first_name :last_name :email])))

(def ^:private CollectionLastEditInfo
  "Schema for the map of bulk last-item-info. A map of two keys, `:card` and `:dashboard`, each of which is a map from
  id to a LastEditInfo.:Schema"
  [:map
   [:card      {:optional true} [:map-of :int LastEditInfo]]
   [:dashboard {:optional true} [:map-of :int LastEditInfo]]])

(mu/defn fetch-last-edited-info :- [:maybe CollectionLastEditInfo]
  "Fetch edited info from the revisions table. Revision information is timestamp, user id, email, first and last
  name. Takes card-ids and dashboard-ids and returns a map structured like

  {:card      {card_id      {:id :email :first_name :last_name :timestamp}}
   :dashboard {dashboard_id {:id :email :first_name :last_name :timestamp}}}"
  [{:keys [card-ids dashboard-ids]}]
  (when (seq (concat card-ids dashboard-ids))
    (let [latest-changes (t2/query {:select    [:u.id :u.email :u.first_name :u.last_name
                                                :r.model :r.model_id :r.timestamp]
                                    :from      [[:revision :r]]
                                    :left-join [[:core_user :u] [:= :u.id :r.user_id]]
                                    :where     [:and [:= :r.most_recent true]
                                                (into [:or]
                                                      (keep (fn [[model-name ids]]
                                                              (when (seq ids)
                                                                [:and [:= :model model-name] [:in :model_id ids]])))
                                                      [["Card" card-ids]
                                                       ["Dashboard" dashboard-ids]])]})]
      (->> latest-changes
           (group-by :model)
           (m/map-vals (fn [model-changes]
                         (into {} (map (juxt :model_id #(dissoc % :model :model_id)))  model-changes)))
           ;; keys are "Card" and "Dashboard" (model in revision table) back to keywords
           (m/map-keys (set/map-invert model->db-model))))))

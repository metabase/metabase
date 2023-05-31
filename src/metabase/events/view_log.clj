(ns metabase.events.view-log
  (:require
   [clojure.core.async :as a]
   [java-time :as t]
   [metabase.api.common :as api]
   [metabase.db.connection :as mdb.connection]
   [metabase.events :as events]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.view-log :refer [ViewLog]]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private view-log-topics
  "The `Set` of event topics which we subscribe to for view counting."
  #{:card-create
    :card-read
    :card-query
    :dashboard-read
    :table-read})

(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to for view counting."}
  view-log-channel
  (a/chan))


;;; ## ---------------------------------------- PER-USER VIEWS ----------------------------------------

(defn- bookmarks-query
  [user-id]
  (let [as-null (when (= (mdb.connection/db-type) :postgres) (h2x/->integer nil))]
    {:select [[:type :model] [:item_id :model_id]]
     :from   [[{:union-all [{:select [:card_id
                                      [as-null :dashboard_id]
                                      [as-null :collection_id]
                                      [:card_id :item_id]
                                      [(h2x/literal "card") :type]
                                      :created_at]
                             :from   [:card_bookmark]
                             :where  [:= :user_id [:inline user-id]]}
                            {:select [[as-null :card_id]
                                      :dashboard_id
                                      [as-null :collection_id]
                                      [:dashboard_id :item_id]
                                      [(h2x/literal "dashboard") :type]
                                      :created_at]
                             :from   [:dashboard_bookmark]
                             :where  [:= :user_id [:inline user-id]]}]}
               :bookmarks]]}))

(defn- recent-views-from-view-log
  [user-id]
  (let [bookmarks (bookmarks-query user-id)
        qe        {:select [[(h2x/literal "qe") :source]
                            [:executor_id :user_id]
                            :context
                            [:started_at :timestamp]
                            [(h2x/literal "card") :model]
                            [:card_id :model_id]
                            [false :dataset]]
                   :from   :query_execution}
        vl        {:select    [[(h2x/literal "vl") :source]
                               :user_id
                               [(h2x/literal "question") :context]
                               :timestamp
                               :model
                               :model_id
                               [:report_card.dataset :dataset]]
                   :from      [:view_log]
                   :left-join [:report_card
                               [:and
                                [:= :view_log.model (h2x/literal "card")]
                                [:= :view_log.model_id :report_card.id]]]}
        views     {:union-all [qe vl]}]
    (t2/query
     {:select   [[[:max :timestamp] :timestamp]
                 :model
                 :model_id]
      :from     [[views :views]]
      :where    [[:and
                  [:= :user_id [:inline user-id]]
                  [:>= :timestamp (t/minus (t/offset-date-time) (t/days 30))]
                  [:not= :context (h2x/literal "pulse")]
                  [:not= :context (h2x/literal "collection")]
                  [:not= :context (h2x/literal "ad-hoc")]
                  [:not= [:composite :context :model] [:composite (h2x/literal "dashboard") (h2x/literal "card")]]
                  [:not= [:composite :source :model :dataset] [:composite (h2x/literal "vl") (h2x/literal "card") [:inline false]]]
                  [:not-in [:composite :model :model_id] bookmarks]]]
      :group-by [:model :model_id]
      :order-by [[:timestamp :desc]]
      :limit    [:inline 8]})))

(defsetting user-recent-views
  (deferred-tru "List of the 10 most recently viewed items for the user.")
  :user-local :only
  :type :json
  :getter (fn []
            (let [value (setting/get-value-of-type :json :user-recent-views)]
              (if value
                (vec value)
                (let [views (mapv #(select-keys % [:model :model_id])
                                  (recent-views-from-view-log api/*current-user-id*))]
                  (setting/set-value-of-type! :json :user-recent-views views)
                  views)))))

;; TODO: remove this setting as part of Audit V2 project.
(defsetting most-recently-viewed-dashboard
  (deferred-tru "The Dashboard that the user has most recently viewed within the last 24 hours.")
  :user-local :only
  :type :json
  :getter (fn []
            (let [{:keys [id timestamp] :as value} (setting/get-value-of-type :json :most-recently-viewed-dashboard)
                  yesterday                        (t/minus (t/zoned-date-time) (t/hours 24))]
              ;; If the latest view is older than 24 hours, return 'nil'
              (when (and value (t/after? (t/zoned-date-time timestamp) yesterday))
                id)))
  :setter (fn [id]
            (when id
              ;; given a dashboard's ID, save it with a timestamp of 'now', for comparing later in the getter
              (setting/set-value-of-type! :json :most-recently-viewed-dashboard {:id id :timestamp (t/zoned-date-time)}))))

;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------

(defn- record-view!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id metadata]
  ;; TODO - we probably want a little code that prunes old entries so that this doesn't get too big
  (t2/insert! ViewLog
              :user_id  user-id
              :model    model
              :model_id model-id
              :metadata metadata))

(defn- update-users-recent-views!
  [user-id model model-id]
  (when user-id
    (mw.session/with-current-user user-id
      (let [view        {:model    (name model)
                         :model_id model-id}
            prior-views (remove #{view} (user-recent-views))]
        (when (= model "dashboard") (most-recently-viewed-dashboard! model-id))
        (when-not ((set prior-views) view)
          (let [new-views (vec (take 10 (conj prior-views view)))]
            (user-recent-views! new-views)))))))

(defn handle-view-event!
  "Handle processing for a single event notification received on the view-log-channel"
  [event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} event]
      (let [model                          (events/topic->model topic)
            model-id                       (events/object->model-id topic object)
            user-id                        (events/object->user-id object)
            {:keys [context] :as metadata} (events/object->metadata object)]
        (when (and (#{:card-query :dashboard-read :table-read} topic)
                   ((complement #{:collection :dashboard}) context)) ;; we don't want to count pinned card views
          (update-users-recent-views! user-id model model-id))
        (record-view! model model-id user-id metadata)))
    (catch Throwable e
      (log/warn (format "Failed to process activity event. %s" (:topic event)) e))))

;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::ViewLog
  [_]
  (events/start-event-listener! view-log-topics view-log-channel handle-view-event!))

(ns metabase-enterprise.introspector.workload.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.introspector.workload.quartz :as quartz]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import (java.time Instant)))

(set! *warn-on-reflection* true)

(defn- parse-instant [s]
  (try (Instant/parse s)
       (catch Throwable _
         (throw (ex-info (str "invalid timestamp: " s) {:status-code 400})))))

(defn- parse-types [types]
  (when types
    (->> (str/split types #",") (remove str/blank?) (map keyword) set)))

(api.macros/defendpoint :get "/grid"
  "Hour-bucket grid for the workload heatmap.
   Required: from, to (ISO-8601 UTC).
   Optional: types (comma-separated job types)."
  [_route-params
   {:keys [from to types]} :- [:map
                               [:from ms/NonBlankString]
                               [:to   ms/NonBlankString]
                               [:types {:optional true} [:maybe :string]]]]
  (quartz/grid (parse-instant from) (parse-instant to)
               {:types (parse-types types)}))

(api.macros/defendpoint :get "/slot"
  "Jobs scheduled in [from, to). Used for the click-to-expand drill-down.
   Required: from, to. Optional: types."
  [_route-params
   {:keys [from to types]} :- [:map
                               [:from ms/NonBlankString]
                               [:to   ms/NonBlankString]
                               [:types {:optional true} [:maybe :string]]]]
  (quartz/slot (parse-instant from) (parse-instant to)
               {:types (parse-types types)}))

(defn- pause-one!
  "Disable the underlying entity for a single workload job. Returns one of
   :paused, :skipped (already inactive), :unsupported, or :not-found."
  [job-type entity-id]
  (cond
    (nil? entity-id) :unsupported

    (= job-type "alert")
    ;; alert id is a notification_subscription_id — disable the parent notification,
    ;; which deletes the scheduler trigger via the model's after-update hook.
    (if-let [notif-id (t2/select-one-fn :notification_id
                                        :model/NotificationSubscription
                                        :id entity-id)]
      (do (t2/update! :model/Notification :id notif-id {:active false})
          :paused)
      :not-found)

    (= job-type "dashboard-subscription")
    ;; pulse archived=true disables all PulseChannels and removes the trigger.
    (if (t2/exists? :model/Pulse :id entity-id)
      (do (t2/update! :model/Pulse :id entity-id {:archived true})
          :paused)
      :not-found)

    :else :unsupported))

(api.macros/defendpoint :post "/pause"
  "Pause (disable) the given workload jobs. Currently supports `alert` and
   `dashboard-subscription` types — other types return :unsupported and are
   skipped. Returns counts per outcome."
  [_route-params
   _query-params
   {:keys [jobs]} :- [:map
                      [:jobs [:sequential
                              [:map
                               [:type :string]
                               [:entity_id [:maybe ms/PositiveInt]]]]]]]
  (let [outcomes (reduce
                  (fn [acc {:keys [type entity_id]}]
                    (let [outcome (try
                                    (pause-one! type entity_id)
                                    (catch Throwable e
                                      (log/warn e "Workload pause failed"
                                                {:type type :entity_id entity_id})
                                      :error))]
                      (update acc outcome (fnil inc 0))))
                  {}
                  jobs)]
    {:status "ok"
     :paused      (get outcomes :paused 0)
     :skipped     (get outcomes :skipped 0)
     :unsupported (get outcomes :unsupported 0)
     :not_found   (get outcomes :not-found 0)
     :error       (get outcomes :error 0)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/introspector/workload` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

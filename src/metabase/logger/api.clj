(ns metabase.logger.api
  "/api/logger endpoints"
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.logger.core :as logger]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.util.concurrent ScheduledFuture ScheduledThreadPoolExecutor ThreadFactory TimeUnit)
   (java.util.concurrent.atomic AtomicInteger)))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/logs"
  "Logs."
  []
  (perms/check-has-application-permission :monitoring)
  (logger/messages))

(defn- all-namespace-names
  []
  (mapv (comp name ns-name) (all-ns)))

(defn- logger
  [namespace-name]
  {:name namespace-name
   :level (logger/ns-log-level namespace-name)})

(defn- loggers-under
  ([namespace-name]
   (loggers-under namespace-name (all-namespace-names)))
  ([namespace-name namespace-names]
   (let [namespace-str (name namespace-name)
         sub-namespace-prefix (str namespace-str ".")]
     (into [] (comp (filter #(or (= % namespace-str)
                                 (str/starts-with? % sub-namespace-prefix)))
                    (map logger))
           namespace-names))))

(mr/def ::log-level
  (into [:enum {:decode/json keyword}] logger/levels))

(defn- presets
  []
  [{:id :sync
    :display_name (tru "Sync issue troubleshooting")
    :loggers (doto (->> (concat (loggers-under "metabase.sync")
                                (loggers-under "metabase.driver.sql-jdbc.sync"))
                        (filter map?)
                        (map #(assoc % :level :debug))
                        (sort-by :name)
                        (vec))
               (as-> $ (when (empty? $) (log/error "Sync preset is empty"))))}
   {:id :linkedfilters
    :display_name (tru "Linked filters troubleshooting")
    :loggers (doto (->> (loggers-under "metabase.parameters.chain-filter")
                        (filter map?)
                        (map #(assoc % :level :debug))
                        (sort-by :name)
                        (vec))
               (as-> $ (when (empty? $) (log/error "Linked filters preset is empty"))))}
   {:id :serialization
    :display_name (tru "Serialization troubleshooting")
    :loggers (doto (->> (cons (logger "metabase.models.serialization")
                              (loggers-under "metabase-enterprise.serialization"))
                        (filter map?)
                        (map #(assoc % :level :debug))
                        (sort-by :name)
                        (vec))
               (as-> $ (when (empty? $) (log/error "Serialization preset is empty"))))}])

(api.macros/defendpoint :get "/presets" :- [:sequential
                                            [:map
                                             [:id :keyword]
                                             [:display_name :string]
                                             [:loggers [:sequential [:map [:name :string] [:level ::log-level]]]]]]
  "Get all known presets."
  []
  (api/check-superuser)
  (presets))

(defn- plan-namespace
  [ns level]
  (let [effective-logger (logger/effective-ns-logger ns)
        current-logger (str effective-logger)
        current-level (logger/ns-log-level current-logger)]
    (cond
      (not= current-logger ns)   {:op :add
                                  :ns ns
                                  :to level}
      (not= current-level level) {:op :change
                                  :ns ns
                                  :from current-level
                                  :to level})))

(defn- create-plan
  [log-levels]
  (into [] (keep (fn [[ns level]] (plan-namespace ns level))) log-levels))

(defn- execute-plan!
  [{:keys [ns to]}]
  (logger/set-ns-log-level! ns to))

(mr/def ::log-adjustment
  [:map
   [:op [:enum :add :change]]
   [:ns :string]
   [:from {:optional true} ::log-level]
   [:to ::log-level]])

(mr/def ::plan
  [:sequential ::log-adjustment])

(mu/defn- set-log-levels! :- ::plan
  [log-levels]
  (let [plan (create-plan log-levels)]
    (run! execute-plan! plan)
    plan))

(defn- undo-log-adjustment!
  [{:keys [op ns from]}]
  (case op
    :add    (logger/remove-ns-logger! ns)
    :change (logger/set-ns-log-level! ns from)))

(defn- undo-plan!
  [plan]
  (run! undo-log-adjustment! plan))

(defonce ^:private ^ScheduledThreadPoolExecutor log-adjustment-timer
  (let [counter (AtomicInteger.)]
    (doto (ScheduledThreadPoolExecutor. 1 (reify ThreadFactory
                                            (newThread [_ runnable]
                                              (doto (Thread. runnable (str "log-adjustment-timer-"
                                                                           (.getAndIncrement counter)))
                                                (.setDaemon true)))))
      (.setRemoveOnCancelPolicy true))))

(def ^:private keyword->TimeUnit
  (ordered-map/ordered-map
   :days         TimeUnit/DAYS
   :hours        TimeUnit/HOURS
   :minutes      TimeUnit/MINUTES
   :seconds      TimeUnit/SECONDS
   :milliseconds TimeUnit/MILLISECONDS
   :microseconds TimeUnit/MICROSECONDS
   :nanoseconds  TimeUnit/NANOSECONDS))

(defn- undo-task
  [plan ^long duration duration-unit]
  (when (seq plan)
    (.schedule log-adjustment-timer ^Runnable #(undo-plan! plan) duration ^TimeUnit (keyword->TimeUnit duration-unit))))

(defn- cancel-undo-task!
  [{:keys [plan ^ScheduledFuture undo-task]}]
  (when (and undo-task (.cancel undo-task false))
    (undo-plan! plan)))

(defonce ^{:private true
           :doc "There can be at most one adjustment at any given time, which is stored here."}
  log-adjustment
  (atom nil))

(mr/def ::time-unit
  (into [:enum {:decode/json keyword}] (keys keyword->TimeUnit)))

(mr/def ::log-levels
  [:map-of :string (into [:enum] (map name) (reverse logger/levels))])

(defn- ->seconds-str
  [unit value]
  (str (case unit
         :days         (* 86400 value)
         :hours        (* 3600 value)
         :minutes      (* 60 value)
         :seconds      value
         :milliseconds (quot value (long 1e3))
         :microseconds (quot value (long 1e6))
         :nanoeconds   (quot value (long 1e9)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/adjustment"
  "Temporarily adjust the log levels."
  [_route-params
   _query-params
   {:keys [duration duration_unit log_levels]} :- [:map
                                                   [:duration :int]
                                                   [:duration_unit ::time-unit]
                                                   [:log_levels :any]]]
  (api/check-superuser)
  (when-not (map? log_levels)
    (let [json-type (condp #(%1 %2) log_levels
                      nil?        "null"
                      boolean?    "boolean"
                      number?     "number"
                      string?     "string"
                      sequential? "array"
                      "something strange")]
      (api/check-400 false {:specific-errors {:log_levels [(str "invalid type, received: " json-type)]}
                            :errors {:_error (tru "Log levels should be an object, {0} received" json-type)}})))
  (let [log-levels (update-keys log_levels #(cond-> % (instance? clojure.lang.Named %) name))]
    (when-let [error (mu/explain ::log-levels log-levels)]
      (api/check-400 false {:specific-errors {:log_levels error}
                            :errors {:_error (tru (str "The format of the provided logging configuration is incorrect."
                                                       " Please follow the following JSON structure:\n{0}")
                                                  (str "{\n  \"namespace\": "
                                                       (str/join " | " (map (fn [l] (str \" (name l) \"))
                                                                            (reverse logger/levels)))
                                                       "\n}"))}}))
    (when-let [task @log-adjustment]
      (cancel-undo-task! task))
    (let [plan (do (if (empty? log-levels)
                     (snowplow/track-event! :snowplow/simple_event {:event "log_adjustments_reset"})
                     (snowplow/track-event! :snowplow/simple_event {:event "log_adjustments_set"
                                                                    :event_detail (->seconds-str duration_unit
                                                                                                 duration)}))
                   (set-log-levels! (update-vals log-levels keyword)))]
      (reset! log-adjustment {:plan plan, :undo-task (undo-task plan duration duration_unit)})))
  nil)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/adjustment"
  "Undo any log level adjustments."
  []
  (api/check-superuser)
  (when-let [task @log-adjustment]
    (snowplow/track-event! :snowplow/simple_event {:event "log_adjustments_reset"})
    (cancel-undo-task! task)
    (reset! log-adjustment nil))
  nil)

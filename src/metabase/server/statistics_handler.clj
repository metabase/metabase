(ns metabase.server.statistics-handler
  "Gathers statistics on Servlet requests to duplicate the functionality of the Jetty 11 Statistics Handler

  Integrates directly with our prometheus integration, so we don't need to translate from one to another."
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.util :as u])
  (:import
   (jakarta.servlet AsyncListener AsyncEvent)
   (jakarta.servlet.http HttpServletRequest HttpServletResponse)
   (org.eclipse.jetty.ee9.nested AsyncContextEvent HandlerWrapper Request)))

(set! *warn-on-reflection* true)

(defn- stats-recorder
  "Tracks a given stat as an atom and logs total/max to prometheus. Returns a function that can be called
  to update the total and potentially update the max value."
  [total-metric-name max-metric-name]
  (let [stat-max (atom 0)]
    (fn [value]
      (prometheus/inc! total-metric-name value)
      (swap! stat-max (fn [current-max]
                        (let [new-max (max value current-max)]
                          (u/prog1 new-max
                            (prometheus/set! max-metric-name new-max))))))))

(defn- stats-counter
  "Tracks a given stat as an atom nad logs total/max/current to prometheus. Returns a function that can be
  called to update the atom and log the metrics to prometheus. Calling with :inc will increment current and
  total and maybe update max. Calling with :dec will decrement current."
  [total-metric-name max-metric-name current-metric-name]
  (let [stat (atom {:current 0 :max 0})]
    (fn [inc-or-dec]
      (assert (contains? #{:inc :dec} inc-or-dec) "Must call with :inc or :dec")
      (when (= :inc inc-or-dec)
        (prometheus/inc! total-metric-name))
      (letfn [(updater [{current-max :max :as current-stat}]
                (let [new-current (update current-stat :current + (if (= inc-or-dec :inc) 1 -1))
                      new-value (cond-> new-current
                                  (= :inc inc-or-dec) (assoc :max (max current-max (:current new-current))))]
                  (u/prog1 new-value
                    (prometheus/set! max-metric-name (:max new-value))
                    (prometheus/set! current-metric-name (:current new-value)))))]
        (swap! stat updater)))))

(defn- inc!
  [counter]
  (counter :inc))

(defn- dec!
  [counter]
  (counter :dec))

(defn- update-response
  [^Request base-request]
  (let [response (.getResponse base-request)]
    (if (.isCommitted response)
      (prometheus/inc! :jetty/responses-total
                       (condp = (quot (.getStatus response) 100)
                         1 {:code "1xx"}
                         2 {:code "2xx"}
                         3 {:code "3xx"}
                         4 {:code "4xx"}
                         5 {:code "5xx"}))
      (prometheus/inc! :jetty/responses-total {:code "4xx"}))
    (prometheus/inc! :jetty/responses-bytes-total (.getContentCount response))))

(defn- on-complete-listener
  [request-counter async-counter request-time]
  (proxy [AsyncListener] []
    (onStartAsync [^AsyncEvent event]
      (.. event getAsyncContext (addListener this)))
    (onTimeout [^AsyncEvent _]
      (prometheus/inc! :jetty/expires-total))
    (onComplete [^AsyncEvent event]
      (let [request (.. ^AsyncContextEvent event getHttpChannelState getBaseRequest)
            time-ms (- (System/currentTimeMillis) (.getTimeStamp request))]
        (dec! request-counter)
        (request-time (/ time-ms 1000))
        (update-response request)
        (dec! async-counter)))))

(defn new-handler
  "Builds a new Servlet HandlerWrapper that handles tracking statistics about this jetty server and logs them using
  prometheus"
  ^HandlerWrapper []
  (let [requests (stats-counter :jetty/requests-total :jetty/requests-max :jetty/requests-active)
        dispatched (stats-counter :jetty/dispatched-total :jetty/dispatched-active-max :jetty/dispatched-active)
        async (stats-counter :jetty/async-requests-total :jetty/async-requests-waiting-max :jetty/async-requests-waiting)
        request-time (stats-recorder :jetty/request-time-seconds-total :jetty/request-time-max-seconds)
        dispatch-time (stats-recorder :jetty/dispatched-time-seconds-total :jetty/dispatched-time-max)
        on-completion (on-complete-listener requests async request-time)]
    (proxy [HandlerWrapper] []
      (handle [^String path ^Request base-request ^HttpServletRequest request ^HttpServletResponse response]
        (let [next (.getHandler ^HandlerWrapper this)
              state (u/prog1 (.getHttpChannelState base-request)
                      (inc! dispatched))
              start (if (.isInitial state)
                      (u/prog1 (.getTimeStamp base-request)
                        (inc! requests))
                      ;; resumed async request
                      (u/prog1 (System/currentTimeMillis)
                        (prometheus/inc! :jetty/async-dispatches-total)))]
          (try
            (.handle next path base-request request response)
            (finally
              (let [now (System/currentTimeMillis)
                    time-ms (- now start)]
                (dec! dispatched)
                (dispatch-time (/ time-ms 1000))
                (when (.isInitial state)
                  (if (.isAsyncStarted state)
                    (do
                      (.addListener state on-completion)
                      (inc! async))
                    (do
                      (dec! requests)
                      (request-time (/ time-ms 1000))
                      (update-response base-request))))))))))))

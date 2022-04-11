(ns metabase.test-runner.junit
  (:require [clojure.test :as t]
            [metabase.test-runner.junit.write :as write]))

(defmulti ^:private handle-event!*
  {:arglists '([event])}
  :type)

(defn handle-event! [{test-var :var, :as event}]
  (let [test-var (or test-var
                     (when (seq t/*testing-vars*)
                       (last t/*testing-vars*)))
        event    (merge
                  {:var test-var}
                  event
                  (when test-var
                    {:ns (:ns (meta test-var))}))]
    (try
      (handle-event!* event)
      (catch Throwable e
        (throw (ex-info (str "Error handling event: " (ex-message e))
                        {:event event}
                        e))))))

;; for unknown event types (e.g. `:clojure.test.check.clojure-test/trial`) just ignore them.
(defmethod handle-event!* :default
  [_])

(defmethod handle-event!* :begin-test-run
  [_]
  (write/clean-output-dir!)
  (write/create-thread-pool!))

(defmethod handle-event!* :summary
  [_]
  (write/wait-for-writes-to-finish))

(defmethod handle-event!* :begin-test-ns
  [{test-ns :ns}]
  (alter-meta!
   test-ns assoc ::context
   {:start-time-ms   (System/currentTimeMillis)
    :timestamp       (java.time.OffsetDateTime/now)
    :test-count      0
    :error-count     0
    :failure-count   0
    :results         []}))

(defmethod handle-event!* :end-test-ns
  [{test-ns :ns, :as event}]
  (let [context (::context (meta test-ns))
        result  (merge
                 event
                 context
                 {:duration-ms (- (System/currentTimeMillis) (:start-time-ms context))})]
    (write/write-ns-result! result)))

(defmethod handle-event!* :begin-test-var
  [{test-var :var}]
  (alter-meta!
   test-var assoc ::context
   {:start-time-ms   (System/currentTimeMillis)
    :assertion-count 0
    :results         []}))

(defmethod handle-event!* :end-test-var
  [{test-ns :ns, test-var :var, :as event}]
  (let [context (::context (meta test-var))
        result  (merge
                 event
                 context
                 {:duration-ms (- (System/currentTimeMillis) (:start-time-ms context))})]
    (alter-meta! test-ns update-in [::context :results] conj result)))

(defn- inc-ns-test-counts! [{test-ns :ns, :as event} & ks]
  (alter-meta! test-ns update ::context (fn [context]
                                          (reduce
                                           (fn [context k]
                                             (update context k inc))
                                           context
                                           ks))))

(defn- record-assertion-result! [{test-var :var, :as event}]
  (let [event (assoc event :testing-contexts (vec t/*testing-contexts*))]
    (alter-meta! test-var update ::context
                 (fn [context]
                   (-> context
                       (update :assertion-count inc)
                       (update :results conj event))))))

(defmethod handle-event!* :pass
  [event]
  (inc-ns-test-counts! event :test-count)
  (record-assertion-result! event))

(defmethod handle-event!* :fail
  [event]
  (inc-ns-test-counts! event :test-count :failure-count)
  (record-assertion-result! event))

(defmethod handle-event!* :error
  [{test-var :var, :as event}]
  ;; some `:error` events happen because of errors in fixture initialization and don't have associated vars/namespaces
  (when test-var
    (inc-ns-test-counts! event :test-count :error-count)
    (record-assertion-result! event)))

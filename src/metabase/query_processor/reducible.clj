(ns metabase.query-processor.reducible
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.context.default :as context.default]))

(defn prepare-context! [context]
  ;; 1) If query doesn't complete by `timeoutf`, call `timeoutf`, which should raise an Exception
  ;; 2) when `out-chan` is closed prematurely, call `cancelf` to send a message to `canceled-chan`
  ;; 3) when `out-chan` is closed or gets a result, close both out-chan and canceled-chan
  (let [out-chan      (context/out-chan context)
        canceled-chan (context/canceled-chan context)
        timeout       (context/timeout context)]
    (a/go
      (let [[val port] (a/alts! [out-chan (a/timeout timeout)] :priority true)]
        (cond
          (not= port out-chan) (context/timeoutf context)
          (nil? val)           (context/cancelf context))
        (log/tracef "Closing out-chan and canceled-chan.")
        (a/close! out-chan)
        (a/close! canceled-chan)))))

(defn pivot [query xformf context]
  (context/runf query xformf context))

(defn combine-middleware [middleware]
  (reduce
   (fn [qp middleware]
     (middleware qp))
   pivot
   middleware))

(defn async-qp [qp]
  (fn qp*
    ([query]
     (qp* query nil))

    ([query context]
     (let [context (merge (context.default/default-context) context)]
       (prepare-context! context)
       (try
         (qp query (context/default-xformf context) context)
         (catch Throwable e
           (context/raisef e context)))
       (context/out-chan context)))))

(defn quit
  ([]
   (quit ::quit))

  ([result]
   (log/trace "Quitting query processing early.")
   (ex-info "Quit early!" {::quit-result result})))

(defn quit-result [e]
  (::quit-result (ex-data e)))

(defn sync-qp
  "Makes a sync QP with the arglists `([query] [query context])`."
  [qp]
  (comp
   (fn [out-chan]
     (let [result (a/<!! out-chan)]
       (if (instance? Throwable result)
         (or (quit-result result)
             (throw result))
         result)))
   qp))

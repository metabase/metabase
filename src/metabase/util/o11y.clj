(ns metabase.util.o11y
  "Observability"
  (:require
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [steffan-westcott.clj-otel.api.trace.span :as span]))

(set! *warn-on-reflection* true)

(defn derefable?
  "Is this value derefable?"
  [v]
  (instance? clojure.lang.IDeref v))

(defn current-time-ns
  "The current time in nanoseconds (good for calculating elapsed time)"
  []
  (System/nanoTime))

(defn elapsed-ms-since
  "The elapsed ms since an older nanoTime"
  [ns]
  (double (/ (- (current-time-ns) ns) (* 1000 1000))))

(defmacro with-span
  "Essentially the same as `steffan-westcott.clj-otel.api.trace.span/with-span`, but a) log as well as emitting a span,
  and b) pull off any `delay`s from the map of span data and just add them to the span data after the body
  runs (presumably they'll be realized there)."
  [log-level args & body]
  `(let [args# (into {} (remove #(derefable? (val %)) ~args))
         derefable-args# (into {} (filter #(derefable? (val %)) ~args))
         do-body# (fn [] ~@body)
         start-time# (current-time-ns)]
     (span/with-span! args#
       (u/prog1 (do-body#)
         (let [dereffed-data# (m/map-vals #(deref % 100 "Error: timed out") derefable-args#)]
           (span/add-span-data! dereffed-data#)
           (log/logf ~log-level "%s (%sms) %s" (:name args#) (elapsed-ms-since start-time#) (merge (dissoc args# :name) dereffed-data#)))))))

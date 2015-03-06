(ns metabase.async
  (:require [medley.core :as m]))

;; afuture for "auto-cancelling future" (?)

(defonce ^{:private true
           :doc "Atom that holds a of list of all afutures."}
  afutures
  (atom '()))

(declare push-afuture)

;; # PUBLIC FNS + MACROS

(defmacro afuture
  "Create a new future that can be cancelled with `cancel-afutures`."
  [& body]
  `(push-afuture (future ~@body)))

(defn cancel-afutures
  "Cancel all afutures."
  []
  (let [futures (m/deref-reset! afutures '())] ; automically swap out list of cancellable futures with new empty list
    (dorun (map future-cancel                  ; Cancel all the futures in the old list
                futures))))

;; # INTERNAL FNS

(defn- clear-finished-afutures
  "Clear out any futures that have already finished so the can be GC'ed"
  []
  (swap! afutures (fn [futures]
                    (filter #(not (future-done? %)) futures))))

(defn push-afuture
  "Add future FTR to `afutures`. Returns FTR."
  [ftr]
  (clear-finished-afutures) ; Run this whenever we create a new afuture so we this get GC'ed in a reasonable amount of time
  (swap! afutures conj ftr)
  ftr)

(ns release
  (:require [colorize.core :as colorize]
            [flatland.ordered.map :as ordered-map]
            [release
             [build :as build]
             [check-prereqs :as check-prereqs]
             [common :as c]
             [draft-release :as draft-release]
             [publish :as publish]
             [set-build-options :as set-build-options]
             [validate :as validate]]))

(set! *warn-on-reflection* true)

(def ^:private steps*
  (ordered-map/ordered-map
   :check-prereqs check-prereqs/check-prereqs
   :set-options   set-build-options/prompt-and-set-build-options!
   :build         build/build!
   :draft-release draft-release/create-draft-release!
   :publish       publish/publish!
   :validate      validate/validate-release
   ;; TODO -- we should loop in the Mac App build code here as well
   ))

(defn- do-step! [step-name]
  (let [thunk (or (get steps* (keyword step-name))
                  (throw (ex-info (format "Invalid step name: %s" step-name)
                                  {:found (set (keys steps*))})))]
    (println (colorize/magenta (format "Running step %s..." step-name)))
    (thunk)))

(defn- do-steps!
  [steps]
  (c/announce "Running steps: %s" steps)
  (doseq [step-name steps]
    (do-step! step-name))
  (c/announce "Success."))

(defn -main [& steps]
  (let [steps (or (seq steps)
                  (keys steps*))]
    (try
      (do-steps! steps)
      (catch Throwable e
        (println (colorize/red (pr-str e)))
        (System/exit -1)))
    (System/exit 0)))

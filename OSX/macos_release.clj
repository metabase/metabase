(ns macos-release
  (:require [colorize.core :as colorize]
            [flatland.ordered.map :as ordered-map]
            [macos-release
             [build :as build]
             [codesign :as codesign]
             [common :as c]
             [create-dmg :as create-dmg]
             [notarize :as notarize]
             [sparkle-artifacts :as sparkle-artifacts]
             [upload :as upload]]))

(set! *warn-on-reflection* true)

(def ^:private steps*
  (ordered-map/ordered-map
   :build                      build/build!
   :codesign                   codesign/codesign!
   :generate-sparkle-artifacts sparkle-artifacts/generate-sparkle-artifacts!
   :create-dmg                 create-dmg/create-dmg!
   :notarize                   notarize/notarize!
   :upload                     upload/upload!))

(defn- do-step! [step-name]
  (let [thunk (or (get steps* (keyword step-name))
                  (throw (ex-info (format "Invalid step name: %s" step-name)
                           {:found (set (keys steps*))})))]
    (println (colorize/magenta (format "Running step %s..." step-name)))
    (thunk)))

(defn- do-steps! [steps]
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
        (System/exit -1))))
  (System/exit 0))

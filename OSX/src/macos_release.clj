(ns macos-release
  (:require [colorize.core :as colorize]
            [flatland.ordered.map :as ordered-map]
            [macos-release
             [build :as build]
             [codesign :as codesign]
             [create-dmg :as create-dmg]
             [download-jar :as download-jar]
             [notarize :as notarize]
             [sparkle-artifacts :as sparkle-artifacts]
             [upload :as upload]]
            [metabuild-common.core :as u]))

(def ^:private steps*
  (ordered-map/ordered-map
   :download-jar               download-jar/download-jar!
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
  (u/announce "Running steps: %s" steps)
  (doseq [step-name steps]
    (do-step! step-name))
  (u/announce "Success."))

(defn -main [& steps]
  (u/exit-when-finished-nonzero-on-exception
    (let [steps (or (seq steps)
                    (keys steps*))]
      (do-steps! steps))))

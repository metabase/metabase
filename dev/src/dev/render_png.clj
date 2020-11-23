(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code"
  (:require [metabase
             [pulse :as pulse]
             [query-processor :as qp]]
            [metabase.models
             [card :as card]
             [user :as user]]
            [metabase.pulse.render :as pulse-render]
            [toucan.db :as tdb]))

;; taken from https://github.com/aysylu/loom/blob/master/src/loom/io.clj
(defn- os
  "Returns :win, :mac, :unix, or nil"
  []
  (condp
      #(<= 0 (.indexOf ^String %2 ^String %1))
      (.toLowerCase (System/getProperty "os.name"))
    "win" :win
    "mac" :mac
    "nix" :unix
    "nux" :unix
    nil))

;; taken from https://github.com/aysylu/loom/blob/master/src/loom/io.clj
(defn- open
  "Opens the given file (a string, File, or file URI) in the default
  application for the current desktop environment. Returns nil"
  [f]
  (let [f (clojure.java.io/file f)]
    ;; There's an 'open' method in java.awt.Desktop but it hangs on Windows
    ;; using Clojure Box and turns the process into a GUI process on Max OS X.
    ;; Maybe it's ok for Linux?
    (condp = (os)
      :mac  (clojure.java.shell/sh "open" (str f))
      :win  (clojure.java.shell/sh "cmd" (str "/c start " (-> f .toURI .toURL str)))
      :unix (clojure.java.shell/sh "xdg-open" (str f)))
    nil))

(defn render-card-to-png
  "Given a card ID, renders the card to a png and opens it. Be aware that the png rendered on a dev machine may not
  match what's rendered on another system, like a docker container."
  [card-id]
  (let [{:keys [dataset_query] :as card} (tdb/select-one card/Card :id card-id)
        user                             (tdb/select-one user/User)
        query-results                    (qp/process-query-and-save-execution! (assoc dataset_query :async? false)
                                                                               {:executed-by (:id user)
                                                                                :context     :pulse
                                                                                :card-id     card-id})
        png-bytes                        (pulse-render/render-pulse-card-to-png (pulse/defaulted-timezone card)
                                                                                card
                                                                                query-results)
        tmp-file                         (java.io.File/createTempFile "card-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes png-bytes))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

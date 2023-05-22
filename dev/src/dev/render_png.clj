(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code. Will create images using the rendering that underpins
  pulses and subscriptions and open those images without needing to send them to slack or email."
  (:require [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [hiccup.core :as hiccup]
            [metabase.models.card :as card]
            [metabase.models.user :as user]
            [metabase.pulse :as pulse]
            [metabase.pulse.render :as render]
            [metabase.pulse.render.test-util :as render.tu]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [toucan.db :as db]))

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
  (let [f (io/file f)]
    ;; There's an 'open' method in java.awt.Desktop but it hangs on Windows
    ;; using Clojure Box and turns the process into a GUI process on Max OS X.
    ;; Maybe it's ok for Linux?
    (condp = (os)
      :mac  (sh/sh "open" (str f))
      :win  (sh/sh "cmd" (str "/c start " (-> f .toURI .toURL str)))
      :unix (sh/sh "xdg-open" (str f)))
    nil))

(defn render-card-to-png
  "Given a card ID, renders the card to a png and opens it. Be aware that the png rendered on a dev machine may not
  match what's rendered on another system, like a docker container."
  [card-id]
  (let [{:keys [dataset_query] :as card} (t2/select-one card/Card :id card-id)
        user                             (t2/select-one user/User)
        query-results                    (binding [qp.perms/*card-id* nil]
                                           (qp/process-query-and-save-execution!
                                            (-> dataset_query
                                                (assoc :async? false)
                                                (assoc-in [:middleware :process-viz-settings?] true))
                                            {:executed-by (:id user)
                                             :context     :pulse
                                             :card-id     card-id}))
        png-bytes                        (render/render-pulse-card-to-png (pulse/defaulted-timezone card)
                                                                                card
                                                                                query-results
                                                                                1000)
        tmp-file                         (java.io.File/createTempFile "card-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes png-bytes))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(defn open-hiccup-as-html [hiccup]
  (let [html-str (hiccup/html hiccup)
        tmp-file (java.io.File/createTempFile "card-html" ".html")]
    (with-open [w (clojure.java.io/writer tmp-file)]
      (.write w html-str))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(comment
  (render-card-to-png 1)
  ;; open viz in your browser
  (-> [["A" "B"]
       [1 2]
       [30 20]]
      (render.tu/make-viz-data :line {:goal-line {:graph.goal_label "Target"
                                                  :graph.goal_value 20}})
      :viz-tree
      open-hiccup-as-html)

  (-> [["As" "Bs" "Cs" "Ds" "Es"]
       ["aa" "bb" "cc" "dd" "ee"]
       ["aaa" "bbb" "ccc" "ddd" "eee"]]
      (render.tu/make-viz-data :table {:reordered-columns   {:order [2 3 1 0 4]}
                                       :custom-column-names {:names ["-A-" "-B-" "-C-" "-D-"]}
                                       :hidden-columns      {:hide [0 2]}})
      :viz-tree
      open-hiccup-as-html)
  )

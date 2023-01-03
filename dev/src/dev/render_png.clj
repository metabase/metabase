(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code. Will create images using the rendering that underpins
  pulses and subscriptions and open those images without needing to send them to slack or email."
  (:require [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [hiccup.core :as hiccup]
            [metabase.models.card :as card]
            [metabase.models.dashboard :as dashboard]
            [metabase.models.user :as user]
            [metabase.pulse :as pulse]
            [metabase.pulse.markdown :as markdown]
            [metabase.pulse.render :as render]
            [metabase.pulse.render.png :as png]
            [metabase.pulse.render.style :as style]
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
  (let [{:keys [dataset_query] :as card} (db/select-one card/Card :id card-id)
        user                             (db/select-one user/User)
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

(def ^:private execute-dashboard #'pulse/execute-dashboard)
(def ^:private render-html-to-png #'png/render-html-to-png)

(defn render-dashboard-to-pngs
  "Given a dashboard ID, renders each dashcard, including Markdown, to its own temporary png image, and opens each one."
  [dashboard-id]
  (let [user              (db/select-one user/User)
        dashboard         (db/select-one dashboard/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)]
    (doseq [{:keys [card dashcard result] :as dashboard-result} dashboard-results]
      (let [render    (if card
                        (render/render-pulse-card :inline (pulse/defaulted-timezone card) card dashcard result)
                        {:content     [:div {:style (style/style {:font-family             "Lato"
                                                                  :font-size               "0.875em"
                                                                  :font-weight             "400"
                                                                  :font-style              "normal"
                                                                  :color                   "#4c5773"
                                                                  :-moz-osx-font-smoothing "grayscale"})}
                                       (markdown/process-markdown (:text dashboard-result) :html)]
                         :attachments nil})
            png-bytes (-> render (render-html-to-png 1000))
            tmp-file  (java.io.File/createTempFile "card-png" ".png")]
        (with-open [w (java.io.FileOutputStream. tmp-file)]
          (.write w ^bytes png-bytes))
        (.deleteOnExit tmp-file)
        (open tmp-file)))))

(def ^:private dashgrid-x 100)
(def ^:private dashgrid-y 80)

(defn- dashboard-dims
  [results]
  (let [height (->> results
                    (sort-by (comp :row :dashcard))
                    last
                    :dashcard
                    ((juxt :row :size_y))
                    (apply +)
                    (* dashgrid-y))
        width  (->> results
                    (sort-by (comp :col :dashcard))
                    last
                    :dashcard
                    ((juxt :col :size_x))
                    (apply +)
                    (* dashgrid-x))]
    [width height]))

(defn- dashcard-style
  [{:keys [row col size_x size_y]}]
  {:position      "absolute"
   :background    "white"
   :border        "1px solid #ededf0"
   :border-radius "8px"
   :margin        "10px"
   :padding       "10px"
   :left          (str (* 2 (+ (* dashgrid-x (or col 0)) 3)) "px")
   :top           (str (* 2 (+ (* dashgrid-y (or row 0)) 3)) "px")
   :width         (str (* 2 (- (* dashgrid-x (or size_x 5)) 21)) "px")
   :height        (str (* 2 (- (* dashgrid-y (or size_y 4)) 21)) "px")})

(defn- render-one-dashcard
  [{:keys [card dashcard result] :as dashboard-result}]
  [:div {:style (style/style (dashcard-style dashcard))}
   (if card
     (-> (render/render-pulse-card :inline (pulse/defaulted-timezone card) card nil #_dashcard result)
         :content
         #_(render.tu/nodes-with-tag :img))
     [:div {:style (style/style {:font-family             "Lato"
                                 :font-size               "13px" #_ "0.875em"
                                 :font-weight             "400"
                                 :font-style              "normal"
                                 :color                   "#4c5773"
                                 :-moz-osx-font-smoothing "grayscale"})}
      (markdown/process-markdown (:text dashboard-result) :html)])])

(defn render-dashboard-to-png
  "Given a dashboard ID, renders all of the dashcards to a single png, attempting to replicate (roughly) the grid layout of the dashboard."
  [dashboard-id]
  (let [user              (db/select-one user/User)
        dashboard         (db/select-one dashboard/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)
        [width height]    (dashboard-dims dashboard-results)
        render            (->> (map render-one-dashcard dashboard-results)
                               (into [:div {:style (style/style {:width            (str (* 2 width) "px")
                                                                 :height           (str (* 2 height) "px")
                                                                 :background-color "#f9fbfc"})}]))
        png-bytes         (-> {:content render :attachments nil} (render-html-to-png (* width 4)))
        tmp-file          (java.io.File/createTempFile "dashboard-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes png-bytes))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(defn render-card-to-bytes
  "Given a card ID, renders the card to a png byte array."
  [card-id]
  (let [{:keys [dataset_query] :as card} (db/select-one card/Card :id card-id)
        user                             (db/select-one user/User)
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
                                                                                1000)]
    png-bytes))

(defn open-hiccup-as-html [hiccup]
  (let [html-str (hiccup/html hiccup)
        tmp-file (java.io.File/createTempFile "card-html" ".html")]
    (with-open [w (clojure.java.io/writer tmp-file)]
      (.write w html-str))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(comment
  (render-card-to-png 1)
  (render-dashboard-to-pngs 1) ;; render the dashboard's dashcards each as their own image
  (render-dashboard-to-png 1)  ;; render the dashboard as a single image
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

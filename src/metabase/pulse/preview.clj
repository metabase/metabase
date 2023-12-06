(ns metabase.pulse.preview
  "Improve the feedback loop for Dashboard Subscription outputs."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [hiccup.core :as hiccup]
   [metabase.pulse :as pulse]
   [metabase.pulse.markdown :as markdown]
   [metabase.pulse.render :as render]
   [metabase.pulse.render.image-bundle :as img]
   [metabase.pulse.render.png :as png]
   [metabase.pulse.render.style :as style]
   [toucan2.core :as t2])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

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
(defn open
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

(def ^:private execute-dashboard #'pulse/execute-dashboard)

(defn render-dashboard-to-pngs
  "Given a dashboard ID, renders each dashcard, including Markdown, to its own temporary png image, and opens each one."
  [dashboard-id]
  (let [user              (t2/select-one :model/User)
        dashboard         (t2/select-one :model/Dashboard :id dashboard-id)
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
            png-bytes (-> render (png/render-html-to-png 1000))
            tmp-file  (java.io.File/createTempFile "card-png" ".png")]
        (with-open [w (java.io.FileOutputStream. tmp-file)]
          (.write w ^bytes png-bytes))
        (.deleteOnExit tmp-file)
        (open tmp-file)))))

(def ^:private dashcard-style
  {:background    "white"
   :border        "1px solid #ededf0"
   :border-radius "8px"
   :margin        "10px"
   :padding       "10px"})

(defn- render-csv-for-dashcard
  [{} #_{:keys [card dashcard dashboard-id]}]
  [:div "WIP"]
  #_(mt/with-fake-inbox
      (mt/with-temp [:model/Pulse         {pulse-id :id, :as pulse}  {:name         "temp pulse"
                                                                      :dashboard_id dashboard-id}
                     :model/PulseCard     _ {:pulse_id          pulse-id
                                             :card_id           (:id card)
                                             :position          0
                                             :dashboard_card_id (:id dashcard)
                                             :include_csv       true}
                     :model/PulseChannel  {pc-id :id} {:pulse_id pulse-id}
                     :model/PulseChannelRecipient _ {:user_id          (mt/user->id :rasta)
                                                     :pulse_channel_id pc-id}]
        (pulse/send-pulse! pulse)
        (-> @mt/inbox
            (get (:email (mt/fetch-user :rasta)))
            last
            :body
            last
            :content
            slurp
            csv-to-html-table))))

(defn- render-one-dashcard
  [{:keys [card dashcard result] :as dashboard-result}]
  [:div {:style (style/style dashcard-style)}
   (if card
     (let [section-style {:border "1px solid black"
                          :padding "10px"}
           base-render (render/render-pulse-card :inline (pulse/defaulted-timezone card) card dashcard result)
           html-src    (-> base-render
                           :content)
           img-src     (-> base-render
                           (png/render-html-to-png 1200)
                           img/render-img-data-uri)
           csv-src (render-csv-for-dashcard dashboard-result)]
       [:div {:style (style/style (merge section-style {:display "flex"}))}
        [:div {:style (style/style section-style)}
         [:h4 "PNG"]
         [:img {:style (style/style {:max-width "400px"})
                :src   img-src}]]
        [:div {:style (style/style (merge section-style {:max-width "400px"}))}
         [:h4 "HTML"]
         html-src]
        [:div {:style (style/style section-style)}
         [:h4 "CSV"]
         csv-src]])
     [:div {:style (style/style {:font-family             "Lato"
                                 :font-size               "13px" #_ "0.875em"
                                 :font-weight             "400"
                                 :font-style              "normal"
                                 :color                   "#4c5773"
                                 :-moz-osx-font-smoothing "grayscale"})}
      (markdown/process-markdown (:text dashboard-result) :html)])])

(defn render-dashboard-to-hiccup
  "Given a dashboard ID, renders all of the dashcards to hiccup datastructure."
  [dashboard-id]
  (let [user              (t2/select-one :model/User)
        dashboard         (t2/select-one :model/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)
        render            (->> (map render-one-dashcard (map #(assoc % :dashboard-id dashboard-id) dashboard-results))
                               (into [:div]))]
    render))

(defn render-dashboard-to-html
  "Given a dashboard ID, renders all of the dashcards into an html document."
  [dashboard-id]
  (hiccup/html (render-dashboard-to-hiccup dashboard-id)))

(defn render-dashboard-to-html-and-open
  "Given a dashboard ID, renders all of the dashcards to an html file and opens it."
  [dashboard-id]
  (let [html-str (render-dashboard-to-html dashboard-id)
        tmp-file (File/createTempFile "card-html" ".html")]
    (with-open [w (io/writer tmp-file)]
      (.write w ^String html-str))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

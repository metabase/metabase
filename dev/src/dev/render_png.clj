(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code. Will create images using the rendering that underpins
  pulses and subscriptions and open those images without needing to send them to slack or email."
  (:require
    [clojure.java.io :as io]
    [clojure.java.shell :as sh]
    [clojure.string :as str]
    [hiccup.core :as hiccup]
    #_[metabase.email.messages :as messages]
    [metabase.models :refer [Card]]
    [metabase.models.card :as card]
    [metabase.pulse :as pulse]
    [metabase.pulse.markdown :as markdown]
    [metabase.pulse.render :as render]
    [metabase.pulse.render.image-bundle :as img]
    [metabase.pulse.render.png :as png]
    [metabase.pulse.render.style :as style]
    [metabase.query-processor :as qp]
    [metabase.test :as mt]
    [toucan2.core :as t2])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

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
  (let [{:keys [dataset_query result_metadata dataset] :as card} (t2/select-one card/Card :id card-id)
        query-results (qp/process-query
                        (cond-> dataset_query
                          dataset
                          (assoc-in [:info :metadata/dataset-metadata] result_metadata)))
        png-bytes     (render/render-pulse-card-to-png (pulse/defaulted-timezone card)
                                                       card
                                                       query-results
                                                       1000)
        tmp-file      (File/createTempFile "card-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes png-bytes))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(defn render-pulse-card
  "Render a pulse card as a data structure"
  [card-id]
  (let [{:keys [dataset_query] :as card} (t2/select-one card/Card :id card-id)
        query-results (qp/process-query dataset_query)]
    (render/render-pulse-card
     :inline (pulse/defaulted-timezone card)
     card
     nil
     query-results)))

(defn open-hiccup-as-html
  "Take a hiccup data structure, render it as html, then open it in the browser."
  [hiccup]
  (let [html-str (hiccup/html hiccup)
        tmp-file (File/createTempFile "card-html" ".html")]
    (with-open [w (io/writer tmp-file)]
      (.write w ^String html-str))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

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

(def ^:private dashgrid-x 50)
(def ^:private dashgrid-y 50)

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

(def ^:private dashcard-style
  {:background    "white"
   :border        "1px solid #ededf0"
   :border-radius "8px"
   :margin        "10px"
   :padding       "10px"})

#_(defn- result-attachment
  [{{{:keys [rows]} :data, :as result} :result}]
  (when (seq rows)
    [(let [^java.io.ByteArrayOutputStream baos (java.io.ByteArrayOutputStream.)]
       (with-open [os baos]
         (#'messages/stream-api-results-to-export-format :csv os result)
         (let [output-string (.toString baos "UTF-8")]
           {:type         :attachment
            :content-type :csv
            :content      output-string})))]))

(def ^:private table-style
  (style/style
   {:border          "1px solid black"
    :border-collapse "collapse"}))

(def ^:private csv-row-limit 10)

(defn- csv-to-html-table [csv-string]
  (let [rows (map #(str/split % #",")
                  (str/split csv-string #"\n"))]
    [:table {:style table-style}
     (for [row (take csv-row-limit rows)]
       [:tr {:style table-style}
        (for [cell row]
          [:td {:style table-style} cell])])]))

(defn- render-csv-for-dashcard
  [{:keys [card dashcard dashboard-id]}]
  (mt/with-fake-inbox
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
      #_(with-redefs [messages/result-attachment result-attachment])
      (pulse/send-pulse! pulse)
      (-> @mt/inbox
          (get (:email (mt/fetch-user :rasta)))
          last
          :body
          last
          :content
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
  "Given a dashboard ID, renders all of the dashcards to a single png, attempting to replicate (roughly) the grid layout of the dashboard."
  [dashboard-id]
  (let [user              (t2/select-one :model/User)
        dashboard         (t2/select-one :model/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)
        render            (->> (map render-one-dashcard (map #(assoc % :dashboard-id dashboard-id) dashboard-results))
                               (into [:div]))]
    render))

(defn render-dashboard-to-html
  "Given a dashboard ID, renders all of the dashcards to a single png, attempting to replicate (roughly) the grid layout of the dashboard."
  [dashboard-id]
  (let [user              (t2/select-one :model/User)
        dashboard         (t2/select-one :model/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)
        [width height]    (dashboard-dims dashboard-results)
        render            (->> (map render-one-dashcard dashboard-results)
                               (into [:div {:style (style/style {:width            (str (* 2 width) "px")
                                                                 :height           (str (* 2 height) "px")
                                                                 :background-color "#f9fbfc"})}]))]
    (open-hiccup-as-html render)))


(comment
  ;; This form has 3 cards:
  ;; - A plain old question
  ;; - A model with user defined metadata
  ;; - A question based on that model
  ;;
  ;; The expected rendered results should be:
  ;; - The plain question will not have custom formatting applied
  ;; - The model and derived query will have custom formatting applied
  (mt/dataset sample-dataset
    (mt/with-temp [Card {base-card-id :id} {:dataset_query {:database (mt/id)
                                                            :type     :query
                                                            :query    {:source-table (mt/id :orders)
                                                                       :expressions  {"Tax Rate" [:/
                                                                                                  [:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                                                                  [:field (mt/id :orders :total) {:base-type :type/Float}]]},
                                                                       :fields       [[:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                                                      [:field (mt/id :orders :total) {:base-type :type/Float}]
                                                                                      [:expression "Tax Rate"]]
                                                                       :limit        10}}}
                   Card {model-card-id :id} {:dataset         true
                                             :dataset_query   {:type     :query
                                                               :database (mt/id)
                                                               :query    {:source-table (format "card__%s" base-card-id)}}
                                             :result_metadata [{:name         "TAX"
                                                                :display_name "Tax"
                                                                :base_type    :type/Float}
                                                               {:name         "TOTAL"
                                                                :display_name "Total"
                                                                :base_type    :type/Float}
                                                               {:name          "Tax Rate"
                                                                :display_name  "Tax Rate"
                                                                :base_type     :type/Float
                                                                :semantic_type :type/Percentage
                                                                :field_ref     [:field "Tax Rate" {:base-type :type/Float}]}]}
                   Card {question-card-id :id} {:dataset_query {:type     :query
                                                                :database (mt/id)
                                                                :query    {:source-table (format "card__%s" model-card-id)}}}]
      (render-card-to-png base-card-id)
      (render-card-to-png model-card-id)
      (render-card-to-png question-card-id))))

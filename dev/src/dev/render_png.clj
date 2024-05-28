(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code. Will create images using the rendering that underpins
  pulses and subscriptions and open those images without needing to send them to slack or email."
  (:require
    [clojure.data.csv :as csv]
    [clojure.java.io :as io]
    [clojure.java.shell :as sh]
    [hiccup.core :as hiccup]
    [metabase.email.messages :as messages]
    [metabase.models :refer [Card]]
    [metabase.models.card :as card]
    [metabase.models.user :as user]
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
  (let [{:keys [dataset_query result_metadata], card-type :type, :as card} (t2/select-one card/Card :id card-id)
        query-results (qp/process-query
                        (cond-> dataset_query
                          (= card-type :model)
                          (assoc-in [:info :metadata/model-metadata] result_metadata)))
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

(def ^:private table-style-map
  {:border          "1px solid black"
   :border-collapse "collapse"
   :padding         "5px"})

(def ^:private table-style
  (style/style table-style-map))

(def ^:private csv-row-limit 10)

(defn- csv-to-html-table [csv-string]
  (let [rows (csv/read-csv csv-string)]
    [:table {:style table-style}
     (for [row (take (inc csv-row-limit) rows)] ;; inc row-limit to include the header and the expected # of rows
       [:tr {:style table-style}
        (for [cell row]
          [:td {:style table-style} cell])])]))

(def ^:private result-attachment #'messages/result-attachment)

(defn- render-csv-for-dashcard
  [part]
  (-> part
      (assoc-in [:card :include_csv] true)
      result-attachment
      first
      :content
      slurp
      csv-to-html-table))

(defn- render-one-dashcard
  [{:keys [card dashcard result] :as dashboard-result}]
  (letfn [(cellfn [content]
            [:td {:style (style/style (merge table-style-map {:max-width "400px"}))}
             content])]
    (if card
      (let [base-render (render/render-pulse-card :inline (pulse/defaulted-timezone card) card dashcard result)
            html-src    (-> base-render :content)
            img-src     (-> base-render
                            (png/render-html-to-png 1200)
                            img/render-img-data-uri)
            csv-src (render-csv-for-dashcard dashboard-result)]
        [:tr
         (cellfn (:name card))
         (cellfn [:img {:style (style/style {:max-width "400px"}) :src img-src}])
         (cellfn html-src)
         (cellfn csv-src)])
      [:tr
       (cellfn nil)
       (cellfn
        [:div {:style (style/style {:font-family             "Lato"
                                    :font-size               "13px" #_ "0.875em"
                                    :font-weight             "400"
                                    :font-style              "normal"
                                    :color                   "#4c5773"
                                    :-moz-osx-font-smoothing "grayscale"})}
         (markdown/process-markdown (:text dashboard-result) :html)])
       (cellfn nil)])))

(defn render-dashboard-to-hiccup
  "Given a dashboard ID, renders all of the dashcards to hiccup datastructure."
  [dashboard-id]
  (let [user              (t2/select-one :model/User)
        dashboard         (t2/select-one :model/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)
        render            (->> (map render-one-dashcard (map #(assoc % :dashboard-id dashboard-id) dashboard-results))
                               (into [[:tr
                                       [:th {:style (style/style table-style-map)} "Card Name"]
                                       [:th {:style (style/style table-style-map)} "PNG"]
                                       [:th {:style (style/style table-style-map)} "HTML"]
                                       [:th {:style (style/style table-style-map)} "CSV"]]])
                               (into [:table {:style (style/style table-style-map)}]))]
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
    (mt/with-temp [Card {base-card-id :id}
                   {:dataset_query {:database (mt/id)
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

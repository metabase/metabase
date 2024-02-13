(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code. Will create images using the rendering that underpins
  pulses and subscriptions and open those images without needing to send them to slack or email."
  (:require
    [clojure.java.io :as io]
    [clojure.java.shell :as sh]
    [hiccup.core :as hiccup]
    [metabase.models :refer [Card]]
    [metabase.models.card :as card]
    [metabase.pulse :as pulse]
    [metabase.pulse.render :as render]
    [metabase.pulse.render.test-util :as render.tu]
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

(comment
  (render-card-to-png 1)

  (let [{:keys [content]} (render-pulse-card 1)]
    (open-hiccup-as-html content))

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
      open-hiccup-as-html))

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

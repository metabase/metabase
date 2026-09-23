(ns metabase.jekyll-mode.files
  (:require
   [clojure.set :as set]
   [metabase.jekyll-mode.files]
   [metabase.util.files :as u.files]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; TODO -- this should be configurable by the user (make it a Setting?)

(defn- directory-prefix []
  "local")

(mr/def ::model
  [:and
   qualified-keyword?
   [:fn
    {:error/message "Valid Toucan model"}
    #(= (namespace %) "model")]])

(def model->directory
  (sorted-map
   :model/Card          "cards"
   :model/Dashboard     "dashboards"
   :model/DashboardCard "dashboard_cards"
   :model/Metric        "metrics"
   :model/Segment       "segments"))

(def directory->model
  (into (sorted-map) (set/map-invert model->directory)))

(mu/defn filename->model :- ::model
  [filename :- :string]
  (directory->model (.. (u.files/get-path filename)
                        getParent
                        getFileName
                        toString)))

(comment
  (filename->model "/Users/camsaul/metabase/local/dashboards/2.yaml"))

(mu/defn- model-directory :- :string
  [model :- ::model]
  (str (directory-prefix)
       "/"
       (model->directory model)))

(mu/defn instance-filename :- :string
  [instance :- [:map
                [:id pos-int?]]]
  (format "%s/%d.yaml"
          (model-directory (t2/model instance))
          (:id instance)))

(mu/defn create-model-directory-if-not-exists!
  [model :- ::model]
  (u.files/create-dir-if-not-exists! (u.files/get-path (model-directory model))))

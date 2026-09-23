(ns metabase.jekyll-mode.files
  (:require
   [metabase.jekyll-mode.files]
   [metabase.util.files :as u.files]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;;; TODO -- this should be configurable by the user (make it a Setting?)

(defn- directory-prefix []
  "local")

(mr/def ::model
  [:and
   qualified-keyword?
   [:fn
    {:error/message "Valid Toucan model"}
    #(= (namespace %) "model")]])

(mu/defn- model-directory :- :string
  [model :- ::model]
  (str (directory-prefix)
       "/"
       (case model
         :model/Dashboard "dashboards")))

(mu/defn instance-filename :- :string
  [instance :- [:map
                [:id pos-int?]]]
  (format "%s/%d.yaml"
          (model-directory (t2/model instance))
          (:id instance)))

(mu/defn create-model-directory-if-not-exists!
  [model :- ::model]
  (u.files/create-dir-if-not-exists! (u.files/get-path (model-directory model))))

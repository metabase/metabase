(ns metabase.jekyll-mode.writeback
  (:require
   [metabase.jekyll-mode.writeback.serialize :as serialize]
   [metabase.util.files :as u.files]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.after]))

(derive :model/Dashboard ::writeback)

(mu/defn- directory :- :string
  [instance]
  (case (t2/model instance)
    :model/Dashboard "static/dashboards"))

(mu/defn- filename :- :string
  [instance]
  (format "%s/%d.yaml" (directory instance) (:id instance)))

(mu/defn- update-file!
  [instance :- [:map
                [:id pos-int?]]]
  (u.files/create-dir-if-not-exists! (u.files/get-path (directory instance)))
  (spit (filename instance) (serialize/serialize instance))
  (printf "Wrote %s %d to %s.\n"
          (t2/model instance)
          (:id instance)
          (filename instance)))

(t2/define-after-update ::writeback [instance]
  (update-file! instance))

(methodical/prefer-method!
 #'toucan2.tools.after/each-row-fn
 [:toucan.query-type/update.* ::writeback]
 [:toucan.query-type/update.* :hook/search-index])

(comment
  (defn- x []
    (-> (t2/select-one :model/Dashboard :id 2)
        (update :name str "_2")
        t2/save!)))

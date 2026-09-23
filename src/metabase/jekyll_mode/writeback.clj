(ns metabase.jekyll-mode.writeback
  (:require
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.writeback.serialize :as serialize]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.after]))

;;; TODO -- move model-related stuff into separate `.models.writeback` namespace

(derive :model/Dashboard ::writeback)

(mu/defn- update-file!
  [{:keys [id], :as instance} :- [:map
                                  [:id pos-int?]]]
  (files/create-model-directory-if-not-exists! (t2/model instance))
  (let [filename (files/instance-filename instance)]
    (spit filename (serialize/serialize instance))
    (printf "Wrote %s %d to %s.\n" (t2/model instance) id filename)))

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

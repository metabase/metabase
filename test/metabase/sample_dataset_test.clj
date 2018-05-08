(ns metabase.sample-dataset-test
  "Tests to make sure the Sample Dataset syncs the way we would expect."
  (:require [expectations :refer :all]
            [metabase
             [sample-data :as sample-data]
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

;;; ---------------------------------------------------- Tooling -----------------------------------------------------

;; These tools are pretty sophisticated for the amount of tests we have!

(defn- sample-dataset-db []
  {:details (#'sample-data/db-details)
   :engine  :h2
   :name    "Sample Dataset"})

(defmacro ^:private with-temp-sample-dataset-db
  "Execute `body` with a temporary Sample Dataset DB bound to `db-binding`."
  {:style/indent 1}
  [[db-binding] & body]
  `(tt/with-temp Database [db# (sample-dataset-db)]
     (sync/sync-database! db#)
     (let [~db-binding db#]
       ~@body)))

(defn- table
  "Get the Table in a `db` with `table-name`."
  [db table-name]
  (db/select-one Table :name table-name, :db_id (u/get-id db)))

(defn- field
  "Get the Field in a `db` with `table-name` and `field-name.`"
  [db table-name field-name]
  (db/select-one Field :name field-name, :table_id (u/get-id (table db table-name))))


;;; ----------------------------------------------------- Tests ------------------------------------------------------

;; Make sure the Sample Dataset is getting synced correctly. For example PEOPLE.NAME should be has_field_values = search
;; instead of `list`.
(expect
  {:description      "The name of the user who owns an account"
   :database_type    "VARCHAR"
   :special_type     :type/Name
   :name             "NAME"
   :has_field_values :search
   :active           true
   :visibility_type  :normal
   :preview_display  true
   :display_name     "Name"
   :fingerprint      {:global {:distinct-count 2499}
                      :type   {:type/Text {:percent-json   0.0
                                           :percent-url    0.0
                                           :percent-email  0.0
                                           :average-length 13.532}}}
   :base_type        :type/Text}
  (with-temp-sample-dataset-db [db]
    (-> (field db "PEOPLE" "NAME")
        ;; it should be `nil` after sync but get set to `search` by the auto-inference. We only set `list` in sync and
        ;; setting anything else is reserved for admins, however we fill in what we think should be the appropiate value
        ;; with the hydration fn
        (hydrate :has_field_values)
        (select-keys [:name :description :database_type :special_type :has_field_values :active :visibility_type
                      :preview_display :display_name :fingerprint :base_type]))))

(ns metabase.things.db
  "Security-lint test example: the data-access layer, exempt from mass-assignment by convention, and where the
  HoneySQL shape rules look."
  (:require [toucan2.core :as t2]))

(defn thing [id] (t2/select-one :model/Thing :id id))
(defn update-thing! [id changes] (t2/update! :model/Thing id changes))

;; a value of any shape in the pk-or-query position: toucan's query when it is not a number
(defn thing-by-key [k] (t2/select-one :model/Thing k))

;; a LIKE pattern built around a search string
(defn things-named-like [q] (t2/select :model/Thing {:where [:like :name (str "%" q "%")]}))

;; a blessed subquery trusting a plain leaf; the sibling coerces
(defn things-owned-by [owner]
  (t2/select :model/Thing {:where [:in :id ^:allow-subquery {:select [:thing_id] :from [:owner] :where [:= :user_id owner]}]}))
(defn things-owned-by-checked [owner]
  (t2/select :model/Thing {:where [:in :id ^:allow-subquery {:select [:thing_id] :from [:owner] :where [:= :user_id (long owner)]}]}))

(defn thing-database-id [id] (t2/select-one-fn :database_id :model/Thing id))

;; a column picked off the row by destructuring: still born from the read
(defn thing-preview-url [id] (let [{:keys [preview_url]} (t2/select-one :model/Thing :id id)] preview_url))

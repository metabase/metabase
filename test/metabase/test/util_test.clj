(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require [expectations :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u]
            [toucan.db :as db]))

;; let's make sure this acutally works right!
(expect
  [-1 0]
  (let [position #(db/select-one-field :position Field :id (data/id :venues :price))]
    [(tu/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
       (position))
     (position)]))

(expect
  0
  (do
    (u/ignore-exceptions
      (tu/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
        (throw (Exception.))))
    (db/select-one-field :position Field :id (data/id :venues :price))))

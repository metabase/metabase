(ns metabase-enterprise.representations.v0.card
  (:require
   [metabase-enterprise.representations.export :as export]))

(defmethod export/representation-type :model/Card [card]
  (:type card))

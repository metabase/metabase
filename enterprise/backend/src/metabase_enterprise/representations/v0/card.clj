(ns metabase-enterprise.representations.v0.card
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]))

(defmethod v0-common/representation-type :model/Card [card]
  (:type card))

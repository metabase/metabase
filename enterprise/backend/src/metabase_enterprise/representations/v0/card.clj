(ns metabase-enterprise.representations.v0.card
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]))

(defmethod v0-common/representation-type :model/Card [t2-card]
  (:type t2-card))

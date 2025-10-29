(ns representations.schema.v0.metric
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.schema.v0.column :as column]
   [representations.schema.v0.common :as common]
   [representations.util.malli.registry :as mr]))

(mr/def ::metric
  [:and
   [:merge
    ::representation/representation
    [:map
     {:closed true
      :description "v0 schema for human-writable metric representation"}
     [:display_name {:optional true} ::common/display-name]
     [:description {:optional true} ::common/description]
     [:database ::common/database]
     [:query ::common/query]
     [:columns {:optional true} ::column/columns]
     [:collection {:optional true} ::common/collection]]]])

(defmethod read-impl/representation->schema [:v0 :metric] [_] ::metric)

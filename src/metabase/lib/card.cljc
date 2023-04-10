(ns metabase.lib.card
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.util.humanization :as u.humanization]))

(defmethod lib.metadata.calculation/metadata-method :metadata/card
  [_query _stage-number {card-name :name, display-name :display_name, :as card-metadata}]
  (cond-> card-metadata
    (not display-name) (assoc :display_name (u.humanization/name->human-readable-name :simple card-name))))

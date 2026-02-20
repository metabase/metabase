(ns metabase.lib.query.field-ref-update
  (:require
   ;; allowed since this is needed to convert legacy queries to MBQL 5
   [metabase.lib.walk :as lib.walk]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some select-keys mapv empty? #?(:clj for)]]
   [weavejester.dependency :as dep]))

(defn- source-type->stage-key
  [source-type]
  (case source-type
    :card :source-card
    :table :source-table))

(defn- update-stage-source-type
  [stage _query [old-source-type old-source-id] [new-source-type new-source-id]]
  (let [old-key (source-type->stage-key old-source-type)
        new-key (source-type->stage-key new-source-type)]
    (cond-> stage
      (= (old-key stage) old-source-id)
      (->
       (dissoc :source-table :source-card)
       (assoc new-key new-source-id)))))

(defn update-field-refs
  "Walk all stages and joins in a query, replacing old source references with new ones."
  [query old-source new-source]
  (lib.walk/walk
   query
   (fn [query _path-type _path stage-or-join]
     (update-stage-source-type stage-or-join query old-source new-source))))

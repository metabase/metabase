(ns metabase.query-processor.util.tag-referenced-cards
  (:require
   [metabase.models.card :refer [Card]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- query->template-tags
  [query]
  (vals (get-in query [:native :template-tags])))

(defn query->tag-card-ids
  "Returns the card IDs from the template tags of the native query of `query`."
  [query]
  (keep :card-id (query->template-tags query)))

(defn tags-referenced-cards
  "Returns Card instances referenced by the given native `query`."
  [query]
  (mapv
   (fn [card-id]
     (if-let [card (t2/select-one Card :id card-id)]
       card
       (throw (ex-info (tru "Referenced question #{0} could not be found" (str card-id))
                       {:card-id card-id}))))
   (query->tag-card-ids query)))

(ns metabase.query-processor.util.tag-referenced-cards
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- query->template-tags
  [query]
  (vals (get-in query [:native :template-tags])))

(defn query->tag-card-ids
  "Returns the card IDs from the template tags of the native query of `query`."
  [query]
  (keep :card-id (query->template-tags query)))

(mu/defn tags-referenced-cards :- [:maybe [:sequential lib.metadata/CardMetadata]]
  "Returns Card instances referenced by the given native `query`."
  [query]
  (mapv
   (fn [card-id]
     (if-let [card (lib.metadata.protocols/card (qp.store/metadata-provider) card-id)]
       card
       (throw (ex-info (tru "Referenced question #{0} could not be found" (str card-id))
                       {:card-id card-id}))))
   (query->tag-card-ids query)))

(ns metabase-enterprise.replacement.field-refs
  "Upgrade the field refs of an entity, the step of a replacement before the swap of the source."
  (:require
   [metabase-enterprise.replacement.entity :as replacement.entity]))

(set! *warn-on-reflection* true)

(defn upgrade-field-refs!
  "Upgrade the field refs of an entity through the `:upgrade-field-refs` of the replacement spec of its model.

  `entity-ref` is a [type id] tuple like [:dashboard 123] or [:card 456].
  `row` is an optional pre-fetched row of the entity, as bulk-load-metadata-for-entities! returns it."
  ([entity-ref]
   (upgrade-field-refs! entity-ref (replacement.entity/row entity-ref)))
  ([[entity-type _entity-id] row]
   (let [spec (replacement.entity/entity-spec entity-type)]
     (when-let [upgrade (and row (:upgrade-field-refs spec))]
       (replacement.entity/apply-writes! (upgrade (replacement.entity/hydrated spec row)))))
   nil))

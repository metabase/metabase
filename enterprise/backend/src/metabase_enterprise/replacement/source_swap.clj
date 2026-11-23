(ns metabase-enterprise.replacement.source-swap
  "Swap sources namespace. Entrypoint is [[swap-source!]]. Internally, we rely on the field references having been
  already upgraded. Then we only have to swap concrete usages.

  The dependencies module recomputes the dependencies of a swapped entity from the update itself: the update event
  marks its dependency status stale and the dependency job computes its dependencies again. An entity that the swap
  leaves unchanged keeps dependencies that are already those of its row."
  (:require
   [metabase-enterprise.replacement.entity :as replacement.entity]
   [metabase.events.core :as events]))

(set! *warn-on-reflection* true)

(defn swap-source!
  "Swap `old-source` for `new-source` in an entity through the `:swap-source` of the replacement spec of its model.

  `entity-ref` is a [type id] tuple like [:card 123] or [:dashboard 456].
  `row` is an optional pre-fetched row of the entity."
  ([entity-ref old-source new-source]
   (swap-source! entity-ref (replacement.entity/row entity-ref) old-source new-source))
  ([[entity-type _entity-id] row old-source new-source]
   (events/with-batched-events
     (let [spec (replacement.entity/entity-spec entity-type)]
       (when-let [swap (and row (:swap-source spec))]
         (when-some [writes (swap (replacement.entity/hydrated spec row) old-source new-source)]
           (replacement.entity/apply-writes! writes)))))
   nil))

(ns metabase-enterprise.replacement.source-swap
  "Swap sources namespace. Entrypoint is [[swap-source!]]. Internally, we rely on the field references having been
  already upgraded. Then we only have to swap concrete usages.

  We also need to update dependencies, which we do in two ways. We explicitly
  call [[models.dependency/swap-dependency!]] regardless of whether the query actually changed (dependency edges may
  shift even without query text changes). Then we fire the entity's update event only when actual changes occurred;
  the event handler will redo dependency calculation, but also triggers other necessary side-effects like revisions.
  This means dependency analysis runs twice when there are changes, which is intentional: suppressing the event
  handler's dependency work would be complicated and could risk the dep graph getting out of sync. If we measure a
  performance problem here, that would be a good optimization step. In practice most swaps don't change queries
  (the table was already upgraded and the query references are the same), so this is rarely an issue."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.replacement.entity :as replacement.entity]
   [metabase.events.core :as events]))

(set! *warn-on-reflection* true)

(defn swap-source!
  "Swap `old-source` for `new-source` in an entity through the `:swap-source` of the replacement spec of its model,
  first moving its dependency on `old-source` to `new-source` when the spec says so.

  `entity-ref` is a [type id] tuple like [:card 123] or [:dashboard 456].
  `row` is an optional pre-fetched row of the entity."
  ([entity-ref old-source new-source]
   (swap-source! entity-ref (replacement.entity/row entity-ref) old-source new-source))
  ([[entity-type _entity-id] row old-source new-source]
   (events/with-batched-events
     (let [spec (replacement.entity/entity-spec entity-type)]
       (when-let [swap (and row (:swap-source spec))]
         (when-some [writes (swap (replacement.entity/hydrated spec row) old-source new-source)]
           (when (:swap-dependency? spec)
             (models.dependency/swap-dependency! entity-type (:id row) old-source new-source))
           (replacement.entity/apply-writes! writes)))))
   nil))

(ns metabase.lib.template-tags
  (:refer-clojure :exclude [not-empty])
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

(mu/defn template-tags->card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Returns the card IDs from the template tags map."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tag-map]]
  (->> (vals template-tags)
       (into #{} (keep :card-id))
       not-empty))

(mu/defn template-tags->snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/native-query-snippet]]
  "Returns the snippet IDs from the template tags map."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tag-map]]
  (->> (vals template-tags)
       (into #{} (keep :snippet-id))
       not-empty))

(mu/defn reconcile-template-tags-order
  "The ONE place that decides the canonical, deduplicated display order of `tags` (a tag-name -> tag map).
  Returns a vector of tag names that is always a permutation of `(keys tags)`.

  Precedence for the starting sequence:
  1. `existing-order`, when non-empty -- its entries that are still real tags are kept, **in their
     positions**, so a user's explicit reorder survives edits that merely add/remove other tags. Stale
     entries (names no longer in `tags`) are dropped and duplicates collapsed.
  2. otherwise `sql-text-order` (the order tags first appear in the native query text), when supplied --
     this is what keeps legacy queries with more than 8 tags rendering in a stable, sensible order instead
     of Clojure's scrambled map iteration order (the original bug, #5136).
  3. otherwise the tag-map key order (last resort).

  Any tag names present in `tags` but missing from the starting sequence (e.g. snippet-expanded tags that
  aren't in the SQL text) are then appended -- in `sql-text-order` when supplied, else map-key order.

  Callers pass `sql-text-order` in; this helper does no parsing, so it lives below
  `metabase.lib.native` and `metabase.lib.schema` (both of which use it) without creating a dependency
  cycle. The arg schemas are deliberately permissive (map / sequential, not the full template-tag schema)
  because this runs during normalization on not-yet-normalized tags and only ever reads the keys. See #5136."
  ([template-tags :- [:maybe [:map-of :any :any]]]
   (reconcile-template-tags-order template-tags nil nil))
  ([template-tags    :- [:maybe [:map-of :any :any]]
    existing-order   :- [:maybe [:sequential :any]]]
   (reconcile-template-tags-order template-tags existing-order nil))
  ([template-tags  :- [:maybe [:map-of :any :any]]
    existing-order :- [:maybe [:sequential :any]]
    sql-text-order :- [:maybe [:sequential :any]]]
   (let [->name    common/normalize-string-key
         tag-names (into #{} (map ->name) (keys template-tags))
         base      (cond
                     (seq existing-order)
                     (into [] (comp (map ->name) (filter tag-names) (distinct)) existing-order)

                     (seq sql-text-order)
                     (into [] (comp (map ->name) (filter tag-names) (distinct)) sql-text-order)

                     :else
                     (into [] (map ->name) (keys template-tags)))
         base-set  (set base)
         append-src (if (seq sql-text-order)
                      (map ->name sql-text-order)
                      (map ->name (keys template-tags)))
         appended  (into [] (comp (filter #(and (tag-names %)
                                                (not (contains? base-set %))))
                                  (distinct))
                         append-src)]
     (into base appended))))

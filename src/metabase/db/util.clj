(ns metabase.db.util
  "Utility functions for generating application DB queries for Metabase-specific stuff like the type system."
  (:require [metabase.util :as u]
            [toucan.db :as db]))

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (db/select-ids FieldValues
       (mdb/join [FieldValues :field_id] [Field :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(db/resolve-model dest-entity) [:= (db/qualify source-entity fk)
                                                  (db/qualify dest-entity pk)]]})

(defn- type-keyword->descendants
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :type/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword]
  ;; make sure `type-keyword` is a valid MB type. There may be some cases where we want to use these functions for
  ;; types outside of the `:type/` hierarchy. If and when that happens, we can reconsider this check. But since no
  ;; such cases currently exist, adding this check to catch typos makes sense.
  {:pre [(isa? type-keyword :type/*)]}
  (set (map u/keyword->qualified-name (cons type-keyword (descendants type-keyword)))))

(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in `metabase.types`.

     (db/select Field :special_type (mdb/isa :type/URL))
      ->
     (db/select Field :special_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional EXPR for use directly in a HoneySQL `where`:

     (db/select Field {:where (mdb/isa :special_type :type/URL)})
     ->
     (db/select Field {:where [:in :special_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (type-keyword->descendants type-keyword)])
  ;; when using this with an `expr` (e.g. `(isa :special_type :type/URL)`) just go ahead and take the results of the
  ;; one-arity impl above and splice expr in as the second element (`[:in #{"type/URL" "type/ImageURL"}]` becomes
  ;; `[:in :special_type #{"type/URL" "type/ImageURL"}]`)
  ([expr type-keyword]
   [:in expr (type-keyword->descendants type-keyword)]))

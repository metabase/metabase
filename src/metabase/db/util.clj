(ns metabase.db.util
  "Utility functions for querying the application database."
  (:require
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(defn primary-key
  "Replacement of [[mdb.u/primary-key]], this is used to make the transition to toucan 2 easier.
  In toucan2, every keyword can be a model so if `model` is a keyword, returns as is, otherwise calls [[mdb.u/primary-key]]."
  [model]
  (if (keyword? model)
   (first (t2/primary-keys :m/card))
   #_{:clj-kondo/ignore [:discouraged-var]}
   (models/primary-key model)))

(defn resolve-model
  "Replacement of [[mb.models/resolve-model]], this is used to make the transition to toucan 2 easier.
  In toucan2, every keyword can be a model so if `model` is a keyword, returns as is, otherwise calls [[toucan1.db/resolve-model]]."
  [model]
  (if (keyword? model)
    model
    #_{:clj-kondo/ignore [:discouraged-var]}
    (db/resolve-model model)))

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (t2/select-pks-set FieldValues
       (mdb/join [FieldValues :field_id] [Field :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(t2/table-name (resolve-model dest-entity))
               [:= (db/qualify source-entity fk) (db/qualify dest-entity pk)]]})

(def ^:private NamespacedKeyword
  (s/constrained s/Keyword (comp seq namespace) "namespaced keyword"))

(s/defn ^:private type-keyword->descendants :- (su/non-empty #{su/NonBlankString})
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :Semantic/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword :- NamespacedKeyword]
  (set (map u/qualified-name (cons type-keyword (descendants type-keyword)))))

(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in `metabase.types`.

     (t2/select Field :semantic_type (mdb/isa :type/URL))
      ->
     (t2/select Field :semantic_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional `expr` for use directly in a HoneySQL `where`:

     (t2/select Field {:where (mdb/isa :semantic_type :type/URL)})
     ->
     (t2/select Field {:where [:in :semantic_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (type-keyword->descendants type-keyword)])
  ;; when using this with an `expr` (e.g. `(isa :semantic_type :type/URL)`) just go ahead and take the results of the
  ;; one-arity impl above and splice expr in as the second element
  ;;
  ;;    [:in #{"type/URL" "type/ImageURL"}]
  ;;
  ;; becomes
  ;;
  ;;    [:in :semantic_type #{"type/URL" "type/ImageURL"}]
  ([expr type-keyword]
   [:in expr (type-keyword->descendants type-keyword)]))

(ns metabase-enterprise.library-branching.instance.tree
  "The Library tree of the instance: the containment closure of the fixed roots, trash included. A write matches an
  identity only inside it, and puts an item only into an in-scope container."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn ancestor-ids
  "The ids of the collections on the path `location` (`/1/5/` gives `[1 5]`)."
  [location]
  (mapv parse-long (re-seq #"\d+" (str location))))

(defn children-location
  "The location of the children of collection row `parent` (`{:id :location}`), or `/` for nil, the root level."
  [parent]
  (if parent
    (str (:location parent) (:id parent) "/")
    "/"))

(defn collection-in-tree?
  "True iff collection row `row` (`{:namespace :type :location}`) is in the Library tree of `roots` (default
  `scope/roots`), trashed or not: its namespace is a root namespace, or it or an ancestor has a root type."
  ([row]
   (collection-in-tree? scope/roots row))
  ([{:keys [collection-types namespaces]} {:keys [namespace type location]}]
   (boolean
    (or (contains? namespaces (some-> namespace keyword))
        (contains? collection-types type)
        (when-let [ids (seq (ancestor-ids location))]
          (some #(contains? collection-types (:type %)) (library-branching.db/collections-by-id (vec ids))))))))

(defn collection-id-in-tree?
  "True iff the collection `collection-id` is in the Library tree of `scope/roots`. Nil, the root collection, is not."
  [collection-id]
  (boolean
   (when collection-id
     (some-> (first (library-branching.db/collections-by-id [collection-id])) collection-in-tree?))))

(defn check-in-tree!
  "Throws ::instance/refused when `in-tree?` is false: the row of identity `id` is outside the Library tree, so no
  item of the Library can take it over."
  [id in-tree?]
  (when-not in-tree?
    (instance/refuse! :outside-library id
                      "An item outside the Library has this identity, so a write cannot take it over.")))

(defn place-area
  "The area of `snapshot/area-roots` whose root is `place`, the place of item `id` of `kind`, or nil when `place` names
  no area root. Throws ::instance/refused when the area root cannot contain an item of `kind`."
  [kind id place]
  (when-let [area (get snapshot/area-roots place)]
    (when-not (contains? (:kinds area) kind)
      (instance/refuse! :place id (str "The root of the " (:name area) " area cannot contain an item of the kind "
                                       (name kind) ".")
                        {:place place}))
    area))

(defn place-collection
  "The collection row (`{:id :entity_id :type :namespace :location :archived}`) of `place`, the container of item
  `id`, or nil when `place` is nil. Throws ::instance/refused when `place` names no in-scope collection; an area root
  is no collection."
  [id place]
  (when place
    (let [row (when-not (contains? snapshot/area-roots place)
                (library-branching.db/collection-by-entity-id place))]
      (when-not (and row (scope/in-scope? :collection place))
        (instance/refuse! :place id (str "The container " place " is not an in-scope collection on this instance.")
                          {:place place}))
      row)))

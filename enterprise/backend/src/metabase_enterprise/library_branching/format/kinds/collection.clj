(ns metabase-enterprise.library-branching.format.kinds.collection
  "The codec of the kind :collection: a directory with its own file `_collection.yaml`. The place is the parent
  collection, under `parent`."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def ^:private areas
  "The directory of each collection namespace that syncs; a collection of no namespace is in the Library."
  {"snippets"     "snippets"
   "transforms"   "transforms"
   "data-actions" "actions"
   "data-apps"    "apps"})

(defn home
  "The Library collection (type library) is the directory `library/`; another root-level collection is in the
  directory of its namespace's area, or in `library/`."
  [{{:keys [type namespace]} :attrs}]
  (if (= "library" type)
    {:dir [] :segment "library"}
    {:dir [(or (get areas namespace) "library")]}))

(defn refs
  "A collection has no references: its place is its container."
  [_id _attrs]
  #{})

(def spec
  "The spec of the collection codec. `:namespace` and `:type` are the collection columns, in their string form."
  {:kind       :collection
   :word       "collection"
   :directory? true
   :home       #'home
   :id-schema  ::snapshot/entity-id
   :name-key   :name
   :place-key  :parent
   :attrs      {:description     {:schema :string}
                :type            {:schema [:string {:min 1}]}
                :namespace       {:schema (into [:enum] (sort (keys areas)))}
                :authority_level {:schema [:string {:min 1}]}}
   :refs       #'refs})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :collection."
  (common/codec spec ::item))

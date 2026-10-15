(ns metabase-enterprise.library-branching.format.kinds.snippet
  "The codec of the kind :snippet: a native query snippet, as the file `<name>.snippet.yaml`. The place is the
  snippet collection, under `collection`, or nil at the root of the snippets namespace."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn home
  "A root-level snippet is in `snippets/`."
  [_item]
  {:dir ["snippets"]})

(defn refs
  "The references of a snippet's template tags: the snippets, cards and fields that they name."
  [_id attrs]
  (portable/refs (:template_tags attrs)))

(def spec
  "The spec of the snippet codec. `:template_tags` is the tag map in its portable JSON form, keyed by tag name, with
  the id of each tag."
  {:kind       :snippet
   :word       "snippet"
   :directory? false
   :home       #'home
   :id-schema  ::snapshot/entity-id
   :name-key   :name
   :place-key  :collection
   :attrs      {:description   {:schema :string}
                :content       {:schema :string :required? true}
                :template_tags {:schema ::common/document-map :default {}}}
   :refs       #'refs})

(mr/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :snippet."
  (common/codec spec ::item))

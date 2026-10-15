(ns metabase-enterprise.library-branching.format.kinds.glossary
  "The codec of the kind :glossary-term: a term of the glossary and its definition, as the file `<term>.term.yaml` in
  `glossary/`. A glossary term is in no collection, so it has no place."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn home
  "Every glossary term is in `glossary/`."
  [_item]
  {:dir ["glossary"]})

(defn refs
  "A glossary term has no references: its definition is text."
  [_id _attrs]
  #{})

(def spec
  "The spec of the glossary term codec. The name is the term, under `term`, of at most 255 characters, as Metabase
  keeps it."
  {:kind        :glossary-term
   :word        "term"
   :directory?  false
   :home        #'home
   :id-schema   ::snapshot/entity-id
   :name-key    :term
   :name-schema [:string {:min 1 :max 255}]
   :place-key   nil
   :attrs       {:definition {:schema :string :required? true}}
   :refs        #'refs})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :glossary-term."
  (common/codec spec ::item))

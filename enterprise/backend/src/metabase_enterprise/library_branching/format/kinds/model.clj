(ns metabase-enterprise.library-branching.format.kinds.model
  "The codec of the kind :model: a card of type model, as the file `<name>.model.yaml` (`format.kinds.card`)."
  (:require
   [metabase-enterprise.library-branching.format.kinds.card :as card]
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(def spec
  "The spec of the model codec: the attributes of every card, and the result metadata, in the form of the serdes
  export of master: the columns as a person edits them (names, descriptions, semantic types, settings), and for a
  native query also their types, which no read of the query can derive. Instance-local attributes (the public link,
  the embedding settings) are not attributes."
  (card/spec :model "model"
             {:result_metadata {:schema [:and [:vector {:min 1} ::common/document-map] ::common/document-vector]}}))

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :model."
  (common/codec spec ::item))

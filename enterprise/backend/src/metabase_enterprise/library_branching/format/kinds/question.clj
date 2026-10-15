(ns metabase-enterprise.library-branching.format.kinds.question
  "The codec of the kind :question: a card of type question, as the file `<name>.question.yaml`
  (`format.kinds.card`). A question of a dashboard names it under `dashboard_id`, and a question of a document names it
  under `document_id`."
  (:require
   [metabase-enterprise.library-branching.format.kinds.card :as card]
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def spec
  "The spec of the question codec: the attributes of every card, and the dashboard or document that holds the
  question. The result metadata is derived from the query, so it is not an attribute; nor are the instance-local
  attributes (the public link, the embedding settings)."
  (card/spec :question "question"
             {:dashboard_id {:schema ::snapshot/entity-id}
              :document_id  {:schema ::snapshot/entity-id}}))

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :question."
  (common/codec spec ::item))

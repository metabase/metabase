(ns metabase-enterprise.library-branching.format.kinds.metric
  "The codec of the kind :metric: a card of type metric, as the file `<name>.metric.yaml` (`format.kinds.card`)."
  (:require
   [metabase-enterprise.library-branching.format.kinds.card :as card]
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(defn home
  "A root-level metric is in `library/`."
  [item]
  (card/home item))

(def spec
  "The spec of the metric codec: the attributes of every card, and the dimensions of a metric. Derived values
  (`result_metadata`, `card_schema`, `query_type`, `database_id`) and instance-local attributes (the public link, the
  embedding settings) are not attributes."
  (card/spec :metric "metric"
             {:dimensions         {:schema ::common/document-vector}
              :dimension_mappings {:schema ::common/document-vector}}))

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :metric."
  (common/codec spec ::item))

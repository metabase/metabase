(ns metabase-enterprise.library-branching.format.kinds.metric
  "The codec of the kind :metric: a card of type metric, as the file `<name>.metric.yaml`. The place is the
  collection, under `collection`. The query is MBQL 5 in its portable JSON form; the file omits the `:lib/type` keys
  that the query's structure implies."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(registry/def ::query
  [:and
   [:map
    [:database :string]
    [:stages [:vector {:min 1} [:map-of :keyword :any]]]]
   [:fn {:error/message "every stage and join of the query has its :lib/type"} portable/implied-keys?]])

(defn home
  "A root-level metric is in `library/`."
  [_item]
  {:dir ["library"]})

(defn refs
  "The references of a metric's query, and of the other attributes that hold portable references (parameters,
  parameter mappings, dimensions, visualization settings)."
  [_id attrs]
  (into (portable/query-refs (:query attrs)) (portable/refs (dissoc attrs :query))))

(defn encode-attrs
  "The attributes as the file holds them: the query without its implied keys."
  [attrs]
  (cond-> attrs
    (contains? attrs :query) (update :query portable/omit-implied)))

(defn decode-attrs
  "The inverse of [[encode-attrs]]."
  [attrs]
  (cond-> attrs
    (contains? attrs :query) (update :query portable/restore-implied)))

(def spec
  "The spec of the metric codec. Derived values (`result_metadata`, `card_schema`, `query_type`, `database_id`) and
  instance-local attributes (the public link, the embedding settings) are not attributes."
  {:kind         :metric
   :word         "metric"
   :directory?   false
   :home         #'home
   :id-schema    ::snapshot/entity-id
   :name-key     :name
   :place-key    :collection
   :attrs        {:description            {:schema :string}
                  :display                {:schema [:string {:min 1}] :required? true}
                  :query                  {:schema ::query :required? true}
                  :visualization_settings {:schema ::common/document-map :default {}}
                  :parameters             {:schema ::common/document-vector :default []}
                  :parameter_mappings     {:schema ::common/document-vector :default []}
                  :collection_position    {:schema :int}
                  :collection_preview     {:schema :boolean :default true}
                  :dimensions             {:schema ::common/document-vector}
                  :dimension_mappings     {:schema ::common/document-vector}}
   :encode-attrs #'encode-attrs
   :decode-attrs #'decode-attrs
   :refs         #'refs})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :metric."
  (common/codec spec ::item))

(ns metabase.search.postgres.filter
  (:require
   [metabase.search.spec :as search.spec]))

(def ^:private context->attr
  {:created-at          :created-at
   :created-by          :creator-id
   :last-edited-at      :last-edited-at
   :last-edited-by      :last-editor-id
   :search-native-query :dataset-query
   :verified            :verified})

(defn- search-context->applicable-models
  "Returns a set of models that are applicable given the search context.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [search-context]
  (let [required (keep context->attr (keys search-context))]
    (into #{}
          (remove nil?)
          (for [search-model (:models search-context)
                :let [spec (search.spec/spec search-model)]]
            (when (every? (:attrs spec) required)
              (:name spec))))))

(comment
  (require 'metabase.search.config)
  (require 'metabase.search.in-place.filter)
  (search-context->applicable-models {:last-edited-at 1 :verified true :models (disj metabase.search.config/all-models "indexed-entity")})
  (metabase.search.in-place.filter/search-context->applicable-models {:last-edited-at 1 :verified true :models (disj metabase.search.config/all-models "indexed-entity")}))

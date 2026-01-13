(ns metabase-enterprise.dependencies.analysis
  (:require
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.malli :as mu]))

(mu/defn returned-columns
  "Get the returned columns of a `query`"
  [driver :- :keyword
   query :- ::lib.schema/query]
  (if (lib/any-native-stage? query)
    (deps.native/native-result-metadata driver query)
    (lib/returned-columns query)))

;; Analyzing an entity in memory ================================================================
(mu/defn- check-query :- [:set [:ref ::lib.schema.validate/error]]
  "Find any bad refs in a `query`."
  [_driver :- :keyword
   query   :- ::lib.schema/query]
  ;; preprocess query first to check for native dependencies
  (if (-> (qp.preprocess/preprocess query)
          lib/any-native-stage?)
    ;; Disabling native sql validation for the moment
    ;; see https://metaboat.slack.com/archives/C09DZ0ASL81/p1768334339046829
    ;; (deps.native/validate-native-query driver query)
    #{}
    (lib/find-bad-refs query)))

(defmulti check-entity
  "Given a metadata provider, an entity type and an entity id, find any bad refs in that entity."
  {:arglists '([metadata-provider entity-type entity-id])}
  (fn [_metadata-provider entity-type _entity-id]
    entity-type))

(defmethod check-entity :default
  [_metadata-provider _entity-type _entity-id]
  nil)

(mu/defmethod check-entity :card :- [:set [:ref ::lib.schema.validate/error]]
  "Given a `MetadataProvider` and a card ID, analyses the card's query to find any bad refs or other issues.
  Returns any findings, and `nil` for a clean query."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   card-id           :- ::lib.schema.id/card]
  (let [query  (lib/query metadata-provider (:dataset-query (lib.metadata/card metadata-provider card-id)))
        driver (:engine (lib.metadata/database query))]
    (check-query driver query)))

(mu/defmethod check-entity :transform :- [:set [:ref ::lib.schema.validate/error]]
  "Given a `MetadataProvider` and a transform ID, analyses the transform's query to find any bad refs or other issues.

  Returns any findings, and `nil` for a clean transform."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   transform-id      :- ::lib.schema.id/transform]
  (let [{{query :query} :source
         :as _transform}  (lib.metadata/transform metadata-provider transform-id)
        driver            (:engine (lib.metadata/database metadata-provider))
        query             (lib/query metadata-provider query)
        output-fields     (returned-columns driver query)
        duplicated-fields (->> output-fields
                               (group-by :name)
                               vals
                               (keep #(when (> (count %) 1)
                                        (lib/duplicate-column-error (-> % first :name))))
                               seq)]
    (cond-> (check-query driver query)
      duplicated-fields (into duplicated-fields))))

(mu/defmethod check-entity :segment :- [:set [:ref ::lib.schema.validate/error]]
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   segment-id        :- ::lib.schema.id/segment]
  (let [query (->> (lib.metadata/segment metadata-provider segment-id)
                   :definition
                   (lib/query metadata-provider))
        driver (:engine (lib.metadata/database query))]
    (check-query driver query)))

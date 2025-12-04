(ns metabase-enterprise.dependencies.analysis
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;; Analyzing an entity in memory ================================================================
(mu/defn- check-query
  "Find any bad refs in a `query`."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (if (lib/any-native-stage? query)
    (m/assoc-some {} :native-issues (seq (deps.native/validate-native-query driver query)))
    (m/assoc-some {} :bad-refs (seq (lib/find-bad-refs query)))))

(defmulti check-entity
  "Given a metadata provider, an entity type and an entity id, find any bad refs in that entity."
  {:arglists '([metadata-provider entity-type entity-id])}
  (fn [_metadata-provider entity-type _entity-id]
    entity-type))

(defmethod check-entity :default
  [_entity-type _entity-id]
  nil)

(mr/def ::query-findings
  [:map
   [:bad-refs      {:optional true} [:sequential ::lib.schema.ref/ref]]
   [:native-issues {:optional true} :any]])

(mr/def ::card-findings
  [:ref ::query-findings])

(mu/defmethod check-entity :card :- [:maybe ::card-findings]
  "Given a `MetadataProvider` and a card ID, analyses the card's query to find any bad refs or other issues.
  Returns any findings, and `nil` for a clean query."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   card-id           :- pos-int?]
  (let [query  (lib/query metadata-provider (:dataset-query (lib.metadata/card metadata-provider card-id)))
        driver (:engine (lib.metadata/database query))]
    (check-query driver query)))

(mr/def ::transform-findings
  [:merge
   [:ref ::query-findings]
   [:map
    [:duplicated-fields {:optional true} [:sequential ::lib.schema.metadata/metadata-provider]]]])

(mu/defmethod check-entity :transform :- [:maybe ::transform-findings]
  "Given a `MetadataProvider` and a transform ID, analyses the transform's query to find any bad refs or other issues.

  Returns any findings, and `nil` for a clean transform."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   transform-id      :- pos-int?]
  (let [{{target-schema :schema target-name :name} :target
         {query :query} :source
         :as _transform}  (lib.metadata/transform metadata-provider transform-id)
        driver            (:engine (lib.metadata/database metadata-provider))
        query             (lib/query metadata-provider query)
        output-table      (m/find-first #(and (= (:schema %) target-schema)
                                              (= (:name %)   target-name))
                                        (lib.metadata/tables metadata-provider))
        output-fields     (lib.metadata/active-fields metadata-provider (:id output-table))
        duplicated-fields (->> output-fields
                               (group-by :name)
                               vals
                               (mapcat #(when (> (count %) 1)
                                          %))
                               not-empty)]
    (cond-> (check-query driver query)
      duplicated-fields (assoc :duplicated-fields duplicated-fields))))

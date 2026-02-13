(ns metabase-enterprise.replacement.source-swap
  (:require
   [clojure.string :as str]
   [metabase-enterprise.dependencies.models.dependency :as deps.models.dependency]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [toucan2.core :as t2]))

(defn- normalize-mbql-stages [query]
  (metabase.lib.walk/walk-clauses
   query
   (fn [query path-type path clause]
     (when (lib/is-field-clause? clause)
       (-> (metabase.lib.walk/apply-f-for-stage-at-path lib/metadata query path clause)
           lib/ref)))))

(defn- normalize-native-stages [query]
  ;; TODO: make this work
  query)

(defn- normalize-query [query]
  (cond-> query
    (lib/any-native-stage? query) normalize-native-stages
    (not (lib/native-only-query? query)) normalize-mbql-stages))

(def ^:private source-type->stage-key
  {:card :source-card
   :table :source-table})

(defn- update-mbql-stages [query [old-source-type old-source-id] [new-source-type new-source-id] id-updates]
  (let [old-key (source-type->stage-key old-source-type)
        new-key (source-type->stage-key new-source-type)]
    (metabase.lib.walk/walk
     query
     (fn [query path-type path stage-or-join]
       (cond-> stage-or-join
         (= (old-key stage-or-join) old-source-id) (-> (dissoc old-key)
                                                       (assoc new-key new-source-id)))))))

(defn- replace-template-tags
  "Replaces references to `old-card-id` with `new-card-id` in a template-tags map."
  [tags old-card-id new-card-id]
  (reduce-kv
   (fn [acc k v]
     (if (= (:card-id v) old-card-id)
       (let [new-key (str "#" new-card-id)]
         (assoc acc new-key
                (assoc v
                       :card-id new-card-id
                       :name new-key
                       :display-name new-key)))
       (assoc acc k v)))
   {}
   tags))

(defn- replace-card-refs-in-parsed
  "Walk parsed SQL tokens, replacing card references to old-card-id with new-card-id.
   Returns the reconstructed SQL string.
   Handles card refs with slugs like {{#42-my-query-name}}."
  [parsed old-card-id new-card-id]
  (let [old-tag (str "#" old-card-id)
        new-tag (str "{{#" new-card-id "}}")]
    (apply str
           (for [token parsed]
             (cond
               (string? token)
               token

               (params/Param? token)
               (let [k (:k token)]
                 ;; Match exact tag or tag with slug suffix (e.g., #42 or #42-my-query)
                 (if (or (= k old-tag)
                         (str/starts-with? k (str old-tag "-")))
                   new-tag
                   (str "{{" k "}}")))

               (params/Optional? token)
               (str "[[" (replace-card-refs-in-parsed (:args token) old-card-id new-card-id) "]]")

               :else
               (str token))))))

(defn swap-card-in-native-query
  "Pure transformation: replaces references to `old-card-id` with `new-card-id`
   in a native dataset-query's query text and template-tag map.
   Handles pMBQL format ([:stages 0 :native] and [:stages 0 :template-tags]).

   Uses the Metabase parameter parser to properly identify card references,
   handling edge cases like:
   - Card refs with slugs: {{#42-my-query}}
   - Card refs with whitespace: {{ #42 }}
   - Card refs in optional clauses: [[...{{#42}}...]]"
  [dataset-query old-card-id new-card-id]
  (let [sql (get-in dataset-query [:stages 0 :native])
        parsed (params.parse/parse sql)
        new-sql (replace-card-refs-in-parsed parsed old-card-id new-card-id)]
    (-> dataset-query
        (assoc-in [:stages 0 :native] new-sql)
        (update-in [:stages 0 :template-tags] replace-template-tags old-card-id new-card-id))))

(defn- update-native-stages [query [_old-source-type old-source-id] [_new-source-type new-source-id] _id-updates]
  (swap-card-in-native-query query old-source-id new-source-id))

(defn- update-query [query old-source new-source id-updates]
  (cond-> query
    (lib/any-native-stage? query) (update-native-stages old-source new-source id-updates)
    (not (lib/native-only-query? query)) (update-mbql-stages old-source new-source id-updates)))

(defn- update-entity-query [f entity-type entity-id]
  (case entity-type
    :card (let [card (t2/select-one :model/Card :id entity-id)]
            (when-let [query (:dataset_query card)]
              (let [new-query (f query)
                    updated   (assoc card :dataset_query new-query)]
                (t2/update! :model/Card entity-id {:dataset_query new-query})
                ;; TODO: not sure we really want this code to have to know about dependency tracking
                ;; TODO: publishing this event twice per update seems bad
                (events/publish-event! :event/card-dependency-backfill
                                       {:object updated}))))
    nil))

(defn swap-source [[old-source-type old-source-id :as old-source]
                   [new-source-type new-source-id :as new-source]]
  (let [children (deps.models.dependency/transitive-dependents
                  (deps.models.dependency/filtered-graph-dependents nil (fn [entity-type-field entity-id-field]
                                                                          [:not= entity-type-field "transform"]))
                  {old-source-type [{:id old-source-id}]})]
    (doseq [[child-type child-ids] children
            child-id child-ids]
      (update-entity-query #(-> (normalize-query %)
                                (update-query old-source new-source {}))
                           child-type child-id))))

(defn swap-native-card-source!
  "Updates a single card's native query, replacing references to `old-card-id`
   with `new-card-id` in both the query text and template tags. Persists the
   change and publishes a dependency-backfill event."
  [card-id old-card-id new-card-id]
  (update-entity-query #(swap-card-in-native-query % old-card-id new-card-id)
                       :card card-id))

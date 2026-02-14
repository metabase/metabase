(ns metabase-enterprise.replacement.source-swap
  (:require
   [clojure.string :as str]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::source-ref
  "A reference to a card or table, e.g. [:card 123] or [:table 45].

   Called 'source-ref' because these are things that can be a query's :source-card or
   :source-table. This is distinct from 'entity keys' in the dependency system —
   dashboards, transforms, etc. can *depend on* sources (and appear in `usages` output)
   but cannot themselves *be* sources."
  [:tuple
   [:enum :card :table]
   pos-int?])

(defn- normalize-mbql-stages [query]
  (metabase.lib.walk/walk-clauses
   query
   (fn [query path-type path clause]
     (when (lib/is-field-clause? clause)
       (-> (metabase.lib.walk/apply-f-for-stage-at-path lib/metadata query path clause)
           lib/ref)))))

;; see [QUE-3121: update parameters](https://linear.app/metabase/issue/QUE-3121/update-parameters)
(mu/defn- upgrade-parameter-target :- ::lib.schema.parameter/target
  "Upgrades parameter target refs to use strings where appropriate

   (upgrade-parameter-target query [:dimension [:field 7 nil] {:stage-number 0}])
-> [:dimension [:field \"TOTAL\" {:base-type :type/Float}] {:stage-number 0}]"
  [query :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when-let [field-ref (lib/parameter-target-field-ref target)]
        (let [{:keys [stage-number], :as options, :or {stage-number -1}} (lib/parameter-target-dimension-options target)
              stage-count (lib/stage-count query)]
          (when (and (>= stage-number -1)
                     (< stage-number stage-count))
            (let [filterable-columns (lib/filterable-columns query stage-number)]
              (when-let [matching-column (lib/find-matching-column query stage-number field-ref filterable-columns)]
                #_{:clj-kondo/ignore [:discouraged-var]} ;; ignore ->legacy-MBQL
                [:dimension (-> matching-column lib/ref lib/->legacy-MBQL) options])))))
      target))

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

(defn- swap-card-in-native-query
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
    ;; TODO (eric 2026-02-13): Convert field refs in query.
    :transform (let [transform (t2/select-one :model/Transform :id entity-id)]
                 (when-let [query (get-in transform [:source :query])]
                   (let [new-query (f query)]
                     (when (not= query new-query)
                       (t2/update! :model/Transform entity-id
                                   {:source (assoc (:source transform) :query new-query)})))))
    nil))

(mu/defn swap-source
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].

   Example:
     (swap-source [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead.

   Returns {:swapped [...]} with the list of entities that were updated."
  [old-source :- ::source-ref
   new-source :- ::source-ref]
  (let [found-usages (usages/usages old-source)]
    (t2/with-transaction [_conn]
      (doseq [[entity-type entity-id] found-usages]
        (update-entity-query
         #(-> (normalize-query %)
              (update-query old-source new-source {}))
         entity-type entity-id)))
    {:swapped (vec found-usages)}))

(defn swap-native-card-source!
  "Updates a single card's native query, replacing references to `old-card-id`
   with `new-card-id` in both the query text and template tags. Persists the
   change and publishes a dependency-backfill event."
  [card-id old-card-id new-card-id]
  (update-entity-query #(swap-card-in-native-query % old-card-id new-card-id)
                       :card card-id))

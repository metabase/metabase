(ns metabase-enterprise.replacement.swap.mbql
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(def ^:private source-type->stage-key
  {:card :source-card
   :table :source-table})

(defn- normalize-mbql-stages [query]
  (lib.walk/walk-clauses
   query
   (fn [query path-type path clause]
     (when (lib/is-field-clause? clause)
       (-> (lib.walk/apply-f-for-stage-at-path lib/metadata query path clause)
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

(defn normalize-query
  "Normalize a query's field references through the metadata system.
   Dispatches to native or MBQL normalization as appropriate."
  [query]
  (cond-> query
    (lib/any-native-stage? query) normalize-native-stages
    (not (lib/native-only-query? query)) normalize-mbql-stages))

(defn update-mbql-stages
  "Walk all stages and joins in a query, replacing old source references with new ones."
  [query [old-source-type old-source-id] [new-source-type new-source-id] id-updates]
  (let [old-key (source-type->stage-key old-source-type)
        new-key (source-type->stage-key new-source-type)]
    (lib.walk/walk
     query
     (fn [query path-type path stage-or-join]
       (cond-> stage-or-join
         (= (old-key stage-or-join) old-source-id) (-> (dissoc old-key)
                                                       (assoc new-key new-source-id)))))))

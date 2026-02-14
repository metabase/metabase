(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:field` clauses with `:source-field` info
  in the options and adds `:join-alias` info to those `:field` clauses."
  (:refer-clojure :exclude [alias mapv some empty? not-empty get-in])
  (:require
   [better-cond.core :as b]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.join.util :as lib.join.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv some empty? not-empty get-in]]))

(defn- implicitly-joined-fields
  "Find fields that come from implicit join in form `x`, presumably a query.
  Fields from metadata are not considered. It is expected, that field which would cause implicit join is in the query
  and not just in it's metadata. Example of query having `:source-field` fields in `:lib/stage-metadata` and no use of
  `:source-field` field in corresponding `:source-query` would be the one, that uses remappings. See
  [[metabase.parameters.custom-values-test/with-mbql-card-test]]."
  [x]
  (into []
        (distinct)
        (lib.util.match/match (dissoc x :lib/stage-metadata)
          [:field (_opts :guard (every-pred :source-field (complement :join-alias))) _id-or-oname]
          &match)))

(defn- join-alias [dest-table-name source-fk-field-name source-fk-join-alias]
  (lib.join.u/format-implicit-join-name dest-table-name source-fk-field-name source-fk-join-alias))

(mr/def ::fk-field-info
  [:map
   {:closed true} ; closed because it is used as a map key
   [:fk-field-id   ::lib.schema.id/field]
   [:fk-field-name {:optional true} :string]
   [:fk-join-alias {:optional true} ::lib.schema.join/alias]])

(mr/def ::join
  [:merge
   ::lib.schema.join/join
   [:map
    [:fields        [:= :none]]
    [:strategy      [:= :left-join]]
    [:conditions    [:tuple :mbql.clause/=]] ; exactly one condition
    [:fk-field-id   ::lib.schema.id/field]
    [:fk-field-name {:optional true} [:maybe :string]]
    [:fk-join-alias {:optional true} [:maybe ::lib.schema.join/alias]]]])

(mu/defn- fk-field-infos->joins :- [:maybe [:sequential ::join]]
  "Given `fk-field-infos`, return a sequence of maps containing IDs and and other info needed to generate corresponding
  `joined-field` and `:joins` clauses."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   fk-field-infos        :- [:maybe [:sequential ::fk-field-info]]]
  (when (seq fk-field-infos)
    (let [fk-field-ids     (into #{} (map :fk-field-id) fk-field-infos)
          fk-fields        (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/column fk-field-ids)
          target-field-ids (into #{} (keep :fk-target-field-id) fk-fields)
          target-fields    (when (seq target-field-ids)
                             (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/column target-field-ids))
          target-table-ids (into #{} (keep :table-id) target-fields)]
      ;; this is for cache-warming purposes.
      (when (seq target-table-ids)
        (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/table target-table-ids))
      (for [{:keys [fk-field-id fk-field-name fk-join-alias]} fk-field-infos
            :let                                              [fk-field (lib.metadata/field metadata-providerable fk-field-id)]
            :when                                             fk-field
            :let                                              [{pk-id :fk-target-field-id} fk-field]
            :when                                             pk-id]
        (let [{source-table-id :table-id}          (lib.metadata/field metadata-providerable pk-id)
              {table-name :name, :as source-table} (lib.metadata/table metadata-providerable source-table-id)
              alias-for-join                       (join-alias table-name (or fk-field-name (:name fk-field)) fk-join-alias)]

          (-> (lib/join-clause source-table)
              (lib/with-join-alias alias-for-join)
              (lib/with-join-conditions [(lib/= [:field
                                                 (m/assoc-some {:lib/uuid (str (random-uuid))}
                                                               :base-type (when fk-field-name (:base-type fk-field))
                                                               :join-alias fk-join-alias)
                                                 (or fk-field-name fk-field-id)]
                                                [:field
                                                 {:lib/uuid (str (random-uuid)), :join-alias alias-for-join}
                                                 pk-id])])
              (lib/with-join-strategy :left-join)
              (lib/with-join-fields :none)
              (assoc :qp/is-implicit-join true
                     :fk-field-id         fk-field-id)
              (m/assoc-some :fk-field-name fk-field-name
                            :fk-join-alias fk-join-alias)))))))

(mu/defn- field-opts->fk-field-info :- ::fk-field-info
  "Create a [[::fk-field-info]] map that identifies the corresponding implicit join.

  For backward compatibility with refs that don't include `:source-field-name` in cases when they should (cards), omit
  `:fk-field-name` when it matches the raw field name. There should be no difference in the compiled query. The
  problematic case is when refs with and without `:source-field-name` are mixed, but there should be the same implicit
  join for all of them."
  [metadata-providerable                                            :- ::lib.schema.metadata/metadata-providerable
   {:keys [source-field source-field-name source-field-join-alias]} :- :map] ; not `::lib.schema.ref/field.options` because this might come from a legacy ref
  (let [fk-field (lib.metadata/field metadata-providerable source-field)]
    (m/assoc-some {:fk-field-id source-field}
                  :fk-field-name (when (and (some? source-field-name) (not= source-field-name (:name fk-field)))
                                   source-field-name)
                  :fk-join-alias source-field-join-alias)))

(defn- rename-join [{join-alias :alias, :as join} new-alias]
  (-> join
      (assoc :alias new-alias)
      (update :conditions lib.walk/walk-clauses* (fn [clause]
                                                   (lib.util.match/match-lite clause
                                                     [:field {:join-alias (ja :guard (= ja join-alias))} _id-or-name]
                                                     (lib/update-options &match assoc :join-alias new-alias))))))

(mu/defn- implicitly-joined-fields->joins :- [:sequential ::join]
  "Create implicit join maps for a set of `field-clauses-with-source-field`."
  [metadata-providerable           :- ::lib.schema.metadata/metadata-providerable
   field-clauses-with-source-field :- [:sequential :mbql.clause/field]]
  (let [fk-field-infos (->> field-clauses-with-source-field
                            (keep (fn [clause]
                                    (lib.util.match/match-lite clause
                                      [:field (opts :guard (and (:source-field opts) (not (:join-alias opts)))) (id :guard integer?)]
                                      (field-opts->fk-field-info metadata-providerable opts))))
                            distinct
                            not-empty)
        joins          (into []
                             (distinct)
                             (fk-field-infos->joins metadata-providerable fk-field-infos))
        unique-name-fn (lib/non-truncating-unique-name-generator)]
    (mapv (fn [{join-alias :alias, :as join}]
            (let [deduplicated-alias (unique-name-fn join-alias)]
              (cond-> join
                (not= join-alias deduplicated-alias)
                (rename-join deduplicated-alias))))
          joins)))

(mu/defn- visible-joins :- [:sequential ::lib.schema.join/join]
  "Set of all joins that are visible in the current level of the query or in a nested source query."
  [query                       :- ::lib.schema/query
   path                        :- ::lib.walk/path
   {:keys [joins], :as _stage} :- ::lib.schema/stage]
  (into []
        (comp cat
              (m/distinct-by :alias))
        [joins
         (when-let [previous-path (lib.walk/previous-path path)]
           (let [previous-stage (get-in query previous-path)]
             (visible-joins query previous-path previous-stage)))]))

(mu/defn- construct-fk-field-info->join-alias :- [:map-of
                                                  ::fk-field-info
                                                  ::lib.schema.common/non-blank-string]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  ;; Build a map of [[::fk-field-info]] -> alias used for IMPLICIT joins. Only implicit joins have `:fk-field-id`
  (into {}
        (keep (fn [{:keys [fk-field-id fk-field-name fk-join-alias], join-alias :alias}]
                (when fk-field-id
                  [(m/assoc-some {:fk-field-id fk-field-id}
                                 :fk-field-name fk-field-name
                                 :fk-join-alias fk-join-alias)
                   join-alias])))
        (visible-joins query path stage)))

;;; TODO (Cam 7/17/25) -- it seems weird to be updating quite possibly the least important part of stage metadata --
;;; legacy `:field-ref`, which is generally only provided by the QP as a courtesy for use for legacy purposes as a key
;;; in viz settings and nothing else. Why aren't we adding `:metabase.lib.join/join-alias` keys or anything like that?
;;; Why aren't we adding metadata for the fields we spliced in here? It all seems kinda fishy. It might be possible to
;;; take this out completely without breaking anything.
(mu/defn- add-implicit-joins-aliases-to-metadata :- ::lib.schema/stage
  "Add `:join-alias`es to legacy field refs for fields containing `:source-field` in `:lib/stage-metadata` of `query`.
  It is required, that `:source-query` has already it's joins resolved. It is valid, when no `:join-alias` could be
  found. For examaple during remaps, metadata contain fields with `:source-field`, that are not used further in their
  `:source-query`."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (let [fk-field-info->join-alias (construct-fk-field-info->join-alias query path stage)]
    (letfn [(update-legacy-field-ref [field-ref]
              ;; field ref should be a LEGACY field ref.
              (lib.util.match/replace field-ref
                [:field id-or-name (opts :guard (every-pred :source-field (complement :join-alias)))]
                (let [join-alias (fk-field-info->join-alias (field-opts->fk-field-info query opts))]
                  (if (some? join-alias)
                    [:field id-or-name (assoc opts :join-alias join-alias)]
                    &match))))
            (update-col [col]
              (m/update-existing col :field-ref update-legacy-field-ref))
            (update-cols [cols]
              (mapv update-col cols))]
      (update-in stage [:lib/stage-metadata :columns] update-cols))))

(mu/defn- add-join-alias-to-fields-with-source-field :- ::lib.schema/stage
  "Add `:field` `:join-alias` to `:field` clauses with `:source-field` in `form`. Ignore `:lib/stage-metadata`."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (or (when-let [fk-field-info->join-alias (not-empty (construct-fk-field-info->join-alias query path stage))]
        (let [stage' (lib.util.match/replace stage
                       [:field (opts :guard (every-pred :source-field (complement :join-alias))) id-or-name]
                       (if-not (some #{:lib/stage-metadata} &parents)
                         (let [join-alias (or (fk-field-info->join-alias (field-opts->fk-field-info query opts))
                                              (throw (ex-info (tru "Cannot find matching FK Table ID for FK Field {0}"
                                                                   (format "%s %s"
                                                                           (pr-str (:source-field opts))
                                                                           (let [field (lib.metadata/field
                                                                                        query
                                                                                        (:source-field opts))]
                                                                             (pr-str (:display-name field)))))
                                                              {:resolving  &match
                                                               :candidates fk-field-info->join-alias
                                                               :stage      stage})))]
                           (lib/with-join-alias &match join-alias))
                         &match))]
          (when-not (= stage' stage)
            ;; normalize the stage to remove any duplicate fields or breakouts
            (lib/normalize ::lib.schema/stage stage'))))
      stage))

(mu/defn- already-has-join?
  "Whether the current query level already has a join with the same alias."
  [query                       :- ::lib.schema/query
   path                        :- ::lib.walk/path
   {:keys [joins], :as _stage} :- ::lib.schema/stage
   join                        :- ::join]
  (or (some #(= (lib/current-join-alias %) (:alias join))
            joins)
      (when-let [previous-path (lib.walk/previous-path path)]
        (let [previous-stage (get-in query previous-path)]
          (recur query previous-path previous-stage join)))))

(mu/defn- add-condition-fields-from-next-stage :- ::lib.schema/stage
  "Add any fields that are needed for newly-added join conditions in the next stage if they're not already present in
  the current stage's `:fields`. We do not need to do this for fields that are 'visible' in the next stage because we
  already have a join against the table they come from (see #59695)."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (or (when (not-empty (:fields stage))
        (when-let [next-path (lib.walk/next-path query path)]
          (let [next-stage (get-in query next-path)]
            (when-let [joins (not-empty (:joins next-stage))]
              (when-let [needed (not-empty (into #{} (keep :fk-field-id) joins))]
                (let [next-stage-visible-column-ids (into #{}
                                                          (map :id)
                                                          (lib.walk/apply-f-for-stage-at-path
                                                           (fn [query stage-number]
                                                             (lib/visible-columns
                                                              query
                                                              stage-number
                                                              {:include-joined?                              true
                                                               :include-expressions?                         false
                                                               :include-implicitly-joinable?                 false
                                                               :include-implicitly-joinable-for-source-card? false}))
                                                           query
                                                           next-path))]
                  (when-let [needed (not-empty (set/difference needed next-stage-visible-column-ids))]
                    (log/debugf "Adding fields needed for join conditions in next stage: %s" (pr-str needed))
                    (let [stage' (update stage :fields (fn [existing-fields]
                                                         (into []
                                                               cat
                                                               [existing-fields
                                                                (for [field-id needed]
                                                                  [:field {:lib/uuid (str (random-uuid))} field-id])])))]
                      (when-not (= stage' stage)
                        ;; normalize the stage to remove any duplicate fields or breakouts
                        (lib/normalize ::lib.schema/stage stage'))))))))))
      stage))

(mu/defn- add-referenced-fields-from-next-stage :- ::lib.schema/stage
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (or (when-let [next-path (lib.walk/next-path query path)]
        (let [next-stage (get-in query next-path)]
          (when-let [reused-join-aliases (not-empty (::reused-join-aliases next-stage))]
            (when-let [referenced-fields (not-empty
                                          (set (lib.util.match/match (dissoc next-stage :joins :lib/stage-metadata)
                                                 :field
                                                 (when (contains? reused-join-aliases (lib/current-join-alias &match))
                                                   &match))))]
              (log/debugf "Adding referenced fields from next stage: %s" (pr-str referenced-fields))
              (let [stage' (update stage :fields (fn [existing-fields]
                                                   (into []
                                                         cat
                                                         [existing-fields
                                                          (map lib/fresh-uuids referenced-fields)])))]
                (when-not (= stage' stage)
                  ;; normalize the stage to remove any duplicate fields or breakouts
                  (lib/normalize ::lib.schema/stage stage')))))))
      stage))

(mu/defn- add-fields-from-next-stage :- ::lib.schema/stage
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (b/cond
    :let [next-path (lib.walk/next-path query path)]

    (not next-path)
    stage

    (or (seq (lib.walk/apply-f-for-stage-at-path lib/aggregations query path))
        (seq (lib.walk/apply-f-for-stage-at-path lib/breakouts query path)))
    stage

    :let [fields (lib.walk/apply-f-for-stage-at-path lib/fields query path)]

    ;; previous stage `:fields` should DEFINITELY be populated at this point, but it's done by other middleware; if for
    ;; some reason it is not populated then no-op.
    (empty? fields)
    (do
      (log/warnf "Expected :fields to be populated in stage at path %s, but it was not." (pr-str path))
      stage)

    :else
    (->> stage
         (add-condition-fields-from-next-stage query path)
         (add-referenced-fields-from-next-stage query path))))

(mu/defn- join-dependencies :- [:set ::lib.schema.join/alias]
  "Get a set of join aliases that `join` has an immediate dependency on."
  [join :- ::lib.schema.join/join]
  (set
   (lib.util.match/match (:conditions join)
     [:field (opts :guard :join-alias) _id-or-name]
     (let [join-alias (:join-alias opts)]
       (when (and join-alias
                  (not= join-alias (:alias join)))
         join-alias)))))

(mu/defn- topologically-sort-joins :- ::lib.schema.join/joins
  "Sort `joins` by topological dependency order: joins that are referenced by the `:condition` of another will be sorted
  first. If no dependencies exist between joins, preserve the existing order."
  [joins :- ::lib.schema.join/joins]
  (let [;; make a map of join alias -> immediate dependencies
        join->immediate-deps (into {}
                                   (map (fn [join]
                                          [(:alias join) (join-dependencies join)]))
                                   joins)
        ;; make a map of join alias -> immediate and transient dependencies
        all-deps             (fn all-deps [join-alias]
                               (let [immediate-deps (set (get join->immediate-deps join-alias))]
                                 (into immediate-deps
                                       (mapcat all-deps)
                                       immediate-deps)))
        join->all-deps       (into {}
                                   (map (fn [[join-alias]]
                                          [join-alias (all-deps join-alias)]))
                                   join->immediate-deps)
        ;; now we can create a function to decide if one join depends on another
        depends-on?          (fn [join-1 join-2]
                               (contains? (join->all-deps (:alias join-1))
                                          (:alias join-2)))]
    (->> joins
         ;; add a key to each join to record its original position
         (map-indexed (fn [i join]
                        (assoc join ::original-position i)))
         ;; sort the joins by topological order falling back to preserving original position
         (sort (fn [join-1 join-2]
                 (cond
                   (depends-on? join-1 join-2) 1
                   (depends-on? join-2 join-1) -1
                   :else                       (compare (::original-position join-1)
                                                        (::original-position join-2)))))
         ;; remove the keys we used to record original position
         (mapv (fn [join]
                 (dissoc join ::original-position))))))

(mu/defn- resolve-implicit-joins-this-level :- ::lib.schema/stage
  "Add new `:joins` for tables referenced by `:field` forms with a `:source-field`. Add `:join-alias` info to those
  `:fields`. Add additional `:fields` to source query if needed to perform the join."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (let [implicitly-joined-fields (implicitly-joined-fields stage)
        new-joins                (implicitly-joined-fields->joins query implicitly-joined-fields)
        required-joins           (remove #(already-has-join? query path stage %) new-joins)
        reused-join-aliases      (into #{} (map :alias) (set/difference (set new-joins) (set required-joins)))]
    (-> stage
        (cond-> (seq required-joins) (update :joins (fn [existing-joins]
                                                      (m/distinct-by
                                                       :alias
                                                       (concat existing-joins required-joins)))))
        (->> (add-join-alias-to-fields-with-source-field query path))
        (cond-> (seq required-joins) (update :joins topologically-sort-joins))
        (assoc ::reused-join-aliases reused-join-aliases))))

(mu/defn- resolve-implicit-joins :- ::lib.schema/stage
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (-> stage
      (->> (resolve-implicit-joins-this-level query path))
      (cond->> (:lib/stage-metadata stage) (add-implicit-joins-aliases-to-metadata query path))))

(mu/defn- first-pass :- [:maybe ::lib.schema/stage]
  "The first pass adds all of the new joins ([[resolve-implicit-joins-this-level]]) and updates
  metadata ([[add-implicit-joins-aliases-to-metadata]])."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (when (and (= (:lib/type stage) :mbql.stage/mbql)
             (lib.util.match/match-lite stage
               [:field (opts :guard (and (:source-field opts) (not (:join-alias opts)))) _id-or-name] true))
    (when (and driver/*driver*
               (not (driver.u/supports? driver/*driver* :left-join (lib.metadata/database query))))
      (throw (ex-info (tru "{0} driver does not support left join." driver/*driver*)
                      {:driver driver/*driver*
                       :type   qp.error-type/unsupported-feature})))
    (resolve-implicit-joins query path stage)))

(mu/defn- second-pass :- [:maybe ::lib.schema/stage]
  "The second pass adds fields needed to perform any newly-added implicit joins in the next stage to the current
  stage ([[add-fields-from-next-stage]])."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (when (= (:lib/type stage) :mbql.stage/mbql)
    (add-fields-from-next-stage query path stage)))

(mu/defn add-implicit-joins :- ::lib.schema/query
  "Fetch and store any Tables other than the source Table referred to by `:field` clauses with `:source-field` in an
  MBQL query, and add a `:join-tables` key inside the MBQL inner query containing information about the `JOIN`s (or
  equivalent) that need to be performed for these tables.

  This middleware also adds `:join-alias` info to all `:field` forms with `:source-field`s."
  [query :- ::lib.schema/query]
  (-> query
      (lib.walk/walk-stages first-pass)
        ;; The second pass must go backwards, pushing implicitly joined fields downward until they are resolved.
        ;; See #63245 and
        ;; [[metabase.query-processor.middleware.add-implicit-joins-test/implicit-join-from-much-earlier-stage-test]].
      (lib.walk/walk-stages second-pass {:reversed? true})))

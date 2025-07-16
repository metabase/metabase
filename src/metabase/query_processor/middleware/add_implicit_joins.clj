(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:field` clauses with `:source-field` info
  in the options and adds `:join-alias` info to those `:field` clauses."
  (:refer-clojure :exclude [alias])
  (:require
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
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn- previous-path :- [:maybe ::lib.walk/path]
  [path :- ::lib.walk/path]
  (when (pos-int? (last path))
    (conj (vec (butlast path)) (dec (last path)))))

(mu/defn- implicitly-joined-fields :- [:sequential :mbql.clause/field]
  "Find fields that come from implicit join in form `x`, presumably a query.
  Fields from metadata are not considered. It is expected, that field which would cause implicit join is in the query
  and not just in it's metadata. Example of query having `:source-field` fields in `:lib/stage-metadata` and no use of
  `:source-field` field in corresponding `:source-query` would be the one, that uses remappings. See
  [[metabase.parameters.custom-values-test/with-mbql-card-test]]."
  [stage :- ::lib.schema/stage]
  (into
   []
   (distinct)
   (lib.util.match/match (dissoc stage :lib/stage-metadata #_:joins)
     [:field (_opts :guard (every-pred :source-field (complement :join-alias))) _id-or-name]
     &match)))

(mu/defn- join-alias :- ::lib.schema.join/alias
  [dest-table-name      :- :string
   source-fk-field-name :- :string
   source-fk-join-alias :- [:maybe ::lib.schema.join/alias]]
  (lib.join.u/format-implicit-join-name dest-table-name source-fk-field-name source-fk-join-alias))

(mr/def ::fk-field-info
  [:map
   [:fk-field-id   ::lib.schema.id/field]
   [:fk-field-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:fk-join-alias {:optional true} [:maybe ::lib.schema.join/alias]]])

(mr/def ::join
  [:merge
   ::lib.schema.join/join
   [:map
    [:stages              [:sequential
                           {:min 1, :max 1}
                           [:merge
                            [:ref ::lib.schema/stage.mbql]
                            [:map
                             [:source-table ::lib.schema.id/table]]]]]
    [:alias               ::lib.schema.common/non-blank-string]
    [:fields              [:= :none]]
    [:strategy            [:= :left-join]]
    [:conditions          [:sequential {:min 1, :max 1} :mbql.clause/=]]
    [:fk-field-id         ::lib.schema.id/field]
    [:fk-field-name       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
    [:fk-join-alias       {:optional true} [:maybe ::lib.schema.join/alias]]
    [:qp/is-implicit-join {:optional true} [:maybe :boolean]]]])

(mu/defn- fk-field-infos->joins :- [:maybe [:sequential ::join]]
  "Given `fk-field-infos`, return a sequence of joins that we need to add."
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
              (lib/with-join-fields :none)
              (lib/with-join-strategy :left-join)
              (lib/with-join-conditions [(lib/= (cond-> (lib.metadata/field metadata-providerable fk-field-id)
                                                  fk-field-name (-> (assoc :name fk-field-name)
                                                                    (dissoc :id))
                                                  fk-join-alias (lib/with-join-alias fk-join-alias))
                                                (-> (lib.metadata/field metadata-providerable pk-id)
                                                    (lib/with-join-alias alias-for-join)))])
              (assoc :fk-field-id         fk-field-id
                     :qp/is-implicit-join true)
              (m/assoc-some :fk-field-name fk-field-name
                            :fk-join-alias fk-join-alias)))))))

(mu/defn- field-opts->fk-field-info :- ::fk-field-info
  "Create a [[FkFieldInfo]] map that identifies the corresponding implicit join.

  For backward compatibility with refs that don't include `:source-field-name` in cases when they should (cards), omit
  `:fk-field-name` when it matches the raw field name. There should be no difference in the compiled query. The
  problematic case is when refs with and without `:source-field-name` are mixed, but there should be the same implicit
  join for all of them."
  [metadata-providerable                                            :- ::lib.schema.metadata/metadata-providerable
   {:keys [source-field source-field-name source-field-join-alias]} :- ::lib.schema.ref/field.options]
  (let [fk-field (lib.metadata/field metadata-providerable source-field)]
    (m/assoc-some {:fk-field-id source-field}
                  :fk-field-name (when (and (some? source-field-name) (not= source-field-name (:name fk-field)))
                                   source-field-name)
                  :fk-join-alias source-field-join-alias)))

(mu/defn- implicitly-joined-fields->joins :- [:sequential ::join]
  "Create implicit join maps for a set of `field-clauses-with-source-field`."
  [metadata-providerable           :- ::lib.schema.metadata/metadata-providerable
   field-clauses-with-source-field :- [:sequential :mbql.clause/field]]
  (let [k-field-infos (->> field-clauses-with-source-field
                           (map (fn [field-ref]
                                  (let [opts (lib/options field-ref)]
                                    (when (and (:source-field opts)
                                               (not (lib/current-join-alias field-ref)))
                                      (field-opts->fk-field-info metadata-providerable opts)))))
                           distinct
                           not-empty)]
    (into
     []
     (distinct)
     (fk-field-infos->joins metadata-providerable k-field-infos))))

(mu/defn- visible-joins :- [:maybe [:sequential ::lib.schema.join/join]]
  "Set of all joins that are visible in the current stage of the query."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path]
  (into
   (lib.walk/apply-f-for-stage-at-path lib/joins query path)
   (distinct)
   (when-let [previous-path (previous-path path)]
     (visible-joins query previous-path))))

(mu/defn- distinct-fields :- ::lib.schema/fields
  [fields :- [:maybe [:sequential ::lib.schema.ref/ref]]]
  (m/distinct-by
   (fn [field]
     (lib/update-options field (fn [opts]
                                 (-> (m/filter-keys simple-keyword? opts)
                                     (dissoc :base-type :effective-type :ident)
                                     not-empty))))
   fields))

(mu/defn- construct-fk-field-info->join-alias :- [:map-of ::fk-field-info ::lib.schema.join/alias]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path]
  ;; Build a map of [[FkFieldInfo]] -> alias used for IMPLICIT joins. Only implicit joins have `:fk-field-id`
  (into {}
        (keep (fn [{:keys [fk-field-id fk-field-name fk-join-alias], :as join}]
                (when fk-field-id
                  [(m/assoc-some {:fk-field-id fk-field-id}
                                 :fk-field-name fk-field-name
                                 :fk-join-alias fk-join-alias)
                   (lib/current-join-alias join)])))
        (visible-joins query path)))

(mu/defn- add-join-alias-to-fields-with-source-field :- ::lib.schema/query
  "Add `:field` `:join-alias` to `:field` clauses with `:source-field` in `form`. Ignore `:lib/stage-metadata`."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path]
  (let [fk-field-info->join-alias (construct-fk-field-info->join-alias query path)
        find-join-alias           (fn [stage [_field opts _id-or-name :as field-ref]]
                                    (let [fk-field-info (field-opts->fk-field-info query opts)]
                                      (or (fk-field-info->join-alias fk-field-info)
                                          (loop [path path]
                                            (when-let [previous-path (previous-path path)]
                                              (or (let [fk-field-info->join-alias (construct-fk-field-info->join-alias query previous-path)]
                                                    (fk-field-info->join-alias fk-field-info))
                                                  (recur previous-path))))
                                          (throw (ex-info (let [field (lib.metadata/field query (:source-field opts))
                                                                table (lib.metadata/table query (:table-id field))]
                                                            (tru "Cannot find matching implicit join for FK field {0} {1} {2}"
                                                                 (pr-str (:source-field opts))
                                                                 (pr-str (:name table))
                                                                 (pr-str  (:display-name field))))
                                                          {:resolving  field-ref
                                                           :candidates fk-field-info->join-alias
                                                           :stage      stage})))))]
    (update-in
     query path
     (fn [stage]
       (cond-> (lib.util.match/replace stage
                 [:field (opts :guard (every-pred :source-field (complement :join-alias))) id-or-name]
                 (if-not (some #{:lib/stage-metadata} &parents)
                   (let [join-alias (find-join-alias stage &match)]
                     (lib/with-join-alias &match join-alias))
                   &match))
         (seq (:fields stage)) (update :fields distinct-fields))))))

(mu/defn- has-join-with-alias?
  "Whether the current query level already has a join with the same alias."
  [query      :- ::lib.schema/query
   path       :- ::lib.walk/path
   join-alias :- ::lib.schema.join/alias]
  (or (some #(= (lib/current-join-alias %) join-alias)
            (lib.walk/apply-f-for-stage-at-path lib/joins query path))
      (when-let [previous-path (previous-path path)]
        (recur query previous-path join-alias))))

(mu/defn- add-condition-fields-to-previous-stage :- ::lib.schema/query
  "Add any fields that are needed for newly-added join conditions to previous stage `:fields` if they're not already
  present."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path]
  (let [previous-path (previous-path path)]
    (if (empty? (lib.walk/apply-f-for-stage-at-path lib/fields query previous-path))
      query
      (let [needed-ids     (into #{}
                                 (keep :fk-field-id)
                                 (lib.walk/apply-f-for-stage-at-path lib/joins query path))
            previous-stage (get-in query previous-path)
            needed         (when (and (seq needed-ids)
                                      (:source-table previous-stage))
                             (filter #(= (:table-id %) (:source-table previous-stage))
                                     (lib.metadata/bulk-metadata query :metadata/column needed-ids)))
            existing       (lib.walk/apply-f-for-stage-at-path lib/fields query previous-path)
            fields'        (distinct-fields (concat existing (map lib/ref needed)))]
        (assoc-in query (conj (vec previous-path) :fields) fields')))))

(mu/defn- add-referenced-fields-to-previous-stage
  [query        :- ::lib.schema/query
   path         :- ::lib.walk/path
   reused-joins :- [:set ::lib.schema.join/join]]
  (let [reused-join-alias? (into #{} (map :alias) reused-joins)
        stage              (get-in query path)
        referenced-fields  (into #{}
                                 (map lib/fresh-uuids)
                                 (lib.util.match/match (dissoc stage :lib/stage-metadata #_:joins)
                                   [:field
                                    (_opts :guard #(reused-join-alias? (:join-alias %)))
                                    _id-or-name]
                                   &match))
        previous-path      (previous-path path)
        existing           (lib.walk/apply-f-for-stage-at-path lib/fields query previous-path)
        fields'            (distinct-fields (concat existing referenced-fields))]
    (assoc-in query (conj (vec previous-path) :fields) fields')))

(mu/defn- add-fields-to-source :- ::lib.schema/query
  [query        :- ::lib.schema/query
   path         :- ::lib.walk/path
   reused-joins :- [:set ::lib.schema.join/join]]
  (let [previous-path  (previous-path path)
        previous-stage (when previous-path
                         (get-in query previous-path))]
    (cond
      (not previous-stage)
      query

      (= (:lib/type previous-stage) :mbql.stage/native)
      query

      (or (seq (lib.walk/apply-f-for-stage-at-path lib/breakouts query previous-path))
          (seq (lib.walk/apply-f-for-stage-at-path lib/aggregations query previous-path)))
      query

      :else
      (do
        (assert (seq (lib.walk/apply-f-for-stage-at-path lib/fields query previous-path))
                "Previous stage should have non-empty :fields (should have been added by add-implicit-clauses middleware)")
        (-> query
            (add-condition-fields-to-previous-stage path)
            (add-referenced-fields-to-previous-stage path reused-joins))))))

(mu/defn- join-dependencies :- [:set ::lib.schema.join/alias]
  "Get a set of join aliases that `join` has an immediate dependency on."
  [join :- ::lib.schema.join/join]
  (set
   (lib.util.match/match (:conditions join)
     [:field (opts :guard :join-alias) _id-or-name]
     (let [join-alias (lib/current-join-alias &match)]
       (when-not (= join-alias (:alias join))
         join-alias)))))

(mu/defn- topologically-sort-joins :- [:sequential ::lib.schema.join/join]
  "Sort `joins` by topological dependency order: joins that are referenced by the `:condition` of another will be sorted
  first. If no dependencies exist between joins, preserve the existing order."
  [joins :- [:sequential ::lib.schema.join/join]]
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

(mu/defn- resolve-implicit-joins-in-stage :- ::lib.schema/query
  "Add new `:joins` for tables referenced by `:field` forms with a `:source-field`. Add `:join-alias` info to those
  `:fields`. Add additional `:fields` to source query if needed to perform the join."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path]
  (let [stage                    (get-in query path)
        implicitly-joined-fields (implicitly-joined-fields stage)
        new-joins                (implicitly-joined-fields->joins query implicitly-joined-fields)
        required-joins           (remove #(has-join-with-alias? query path (:alias %)) new-joins)
        reused-joins             (set/difference (set new-joins) (set required-joins))]
    (-> (reduce
         (fn [query new-join]
           (update-in query (conj (vec path) :joins) (fn [joins]
                                                       (conj (vec joins) (lib/normalize ::lib.schema.join/join new-join)))))
         query
         required-joins)
        (add-join-alias-to-fields-with-source-field path)
        (add-fields-to-source path reused-joins)
        (cond-> (seq required-joins) (update-in (conj (vec path) :joins) topologically-sort-joins)))))

(mu/defn- add-implicit-joins-to-stage :- [:maybe ::lib.schema/query]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (when (lib.util.match/match-one (dissoc stage :lib/stage-metadata #_:joins)
          [:field (_opts :guard (every-pred :source-field (complement :join-alias))) _id-or-name])
    (when driver/*driver*
      (when-not (driver.u/supports? driver/*driver* :left-join (lib.metadata/database query))
        (throw (ex-info (tru "{0} driver does not support left join." driver/*driver*)
                        {:driver driver/*driver*
                         :type   qp.error-type/unsupported-feature}))))
    (resolve-implicit-joins-in-stage query path)))

(defn- remove-stale-stage-metadatas
  "Remove and `:lib/stage-metadata` that is stale after adding implicit joins.

  TODO (Cam 7/15/25) -- this isn't 100% correct since we should probably also remove metadata for all subsequent
  stages if anything changes, right?"
  [query query']
  (lib.walk/walk-stages
   query'
   (fn [_query path stage]
     (if (= (get-in query' path)
            (get-in query path))
       stage
       (dissoc stage :lib/stage-metadata)))))

(mu/defn add-implicit-joins :- ::lib.schema/query
  "Fetch and store any Tables other than the source Table referred to by `:field` clauses with `:source-field` in an
  MBQL query, and add a `:join-tables` key inside the MBQL inner query containing information about the `JOIN`s (or
  equivalent) that need to be performed for these tables.

  This middleware also adds `:join-alias` info to all `:field` forms with `:source-field`s."
  [query :- ::lib.schema/query]
  (let [query' (lib.walk/walk-stages query add-implicit-joins-to-stage)]
    (remove-stale-stage-metadatas query query')))

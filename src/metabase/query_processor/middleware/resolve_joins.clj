(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `:field` clauses with `:source-field`
  options, and adds information to the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias every? mapv empty?])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? mapv empty?]]))

(mu/defn- merge-defaults :- ::lib.schema.join/join
  [join]
  (merge {:strategy lib.schema.join/default-strategy}
         (when (str/starts-with? (:alias join) lib/legacy-default-join-alias)
           {:qp/keep-default-join-alias true})
         join))

(defn- join-field-refs [cols]
  (let [duplicate-ids (into #{}
                            (keep (fn [[item freq]]
                                    (when (> freq 1)
                                      item)))
                            (frequencies (map :id cols)))]
    ;; TODO (Cam 9/16/25) -- forcing refs of certain types like this is wonky, but when I try to change this tons of
    ;; stuff breaks. Forcing ID refs doesn't work because a join can return multiple versions of the same column
    ;; bucketed in different ways in previous stages; joins thus ought to be using field name refs; but this ends up
    ;; breaking a ton of stuff, especially `lib.equality`... #63109 was my attempt to make this stuff work when using
    ;; field name refs for joins but it's a long way off from landing.
    (for [{field-id :id, :as col} cols
          :let                    [[_tag opts id-or-name, :as field-ref] (lib/ref col)
                                   force-id-ref?         (and (string? id-or-name)
                                                              field-id
                                                              (not (contains? duplicate-ids field-id)))
                                   force-field-name-ref? (and (pos-int? id-or-name)
                                                              (contains? duplicate-ids field-id))]]

      (cond
        force-id-ref?
        [:field opts field-id]

        force-field-name-ref?
        [:field opts (:lib/source-column-alias col)]

        :else
        field-ref))))

(mu/defn- handle-all-fields :- ::lib.schema.join/join
  "Replace `:fields :all` in a join with an appropriate list of Fields."
  [query                             :- ::lib.schema/query
   path :- ::lib.walk/path
   {:keys [fields], :as join} :- ::lib.schema.join/join]
  (merge
   join
   (when (= fields :all)
     ;; do not `:include-remaps?` here, they will get added by the [[metabase.query-processor.middleware.add-remaps]]
     ;; middleware.
     {:fields (join-field-refs
               (lib.walk/apply-f-for-stage-at-path
                lib/join-fields-to-add-to-parent-stage
                query
                path
                join
                {:include-remaps? false}))})))

(mu/defn- resolve-join :- ::lib.schema.join/join
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   join  :- ::lib.schema.join/join]
  (->> join
       merge-defaults
       (handle-all-fields query path)))

(defn- joins->fields
  "Return a flattened list of all `:fields` referenced in `joins`."
  [joins]
  (into []
        (mapcat (fn [{:keys [fields], :as join}]
                  (when (sequential? fields)
                    ;; make sure the field ref has `:join-alias`... it already SHOULD but if the query is NAUGHTY then
                    ;; we better just add it in to be safe. In #61398 which is pending I actually make this happen
                    ;; automatically in MBQL 5 normalization, so we can take this out eventually.
                    (for [field-ref fields]
                      (-> field-ref
                          (lib/with-join-alias (:alias join))
                          ;; Any coercion or temporal bucketing will already have been done in the
                          ;; subquery for the join itself. Mark the parent ref to make sure it is
                          ;; not double-coerced, which leads to SQL errors.
                          (lib/update-options assoc :qp/ignore-coercion true))))))
        joins))

(defn- should-add-join-fields?
  "Should we append the `:fields` from `:joins` to the parent-level query's `:fields`? True unless the parent-level
  query has breakouts or aggregations."
  [{breakouts :breakout, aggregations :aggregation, :as _stage}]
  (every? empty? [aggregations breakouts]))

;;; TODO (Cam 9/16/25) -- update this to use [[metabase.lib.stage/add-cols-from-join]] or share more logic with it
(defn- append-join-fields
  "This (supposedly) matches the behavior of [[metabase.lib.stage/add-cols-from-join]]."
  [fields join-fields]
  ;; we shouldn't consider different type info to mean two Fields are different even if everything else is the same. So
  ;; give everything `:base-type` of `:type/*` (it will complain if we remove `:base-type` entirely from fields with a
  ;; string name)
  (into []
        (comp cat
              (m/distinct-by lib.schema.util/mbql-clause-distinct-key))
        [fields (lib/fresh-uuids join-fields)]))

(defn append-join-fields-to-fields
  "Add the fields from join `:fields`, if any, to the parent-level `:fields`."
  [stage join-fields]
  (cond-> stage
    (seq join-fields) (update :fields append-join-fields join-fields)))

(mu/defn- merge-joins-fields :- ::lib.schema/stage.mbql
  "Append the `:fields` from `:joins` into their parent level as appropriate so joined columns appear in the final
  query results, and remove the `:fields` entry for all joins.

  If the parent-level query has breakouts and/or aggregations, this function won't append the joins fields to the
  parent level, because we should only be returning the ones from the ags and breakouts in the final results."
  [{:keys [joins], :as stage} :- ::lib.schema/stage.mbql]
  (let [join-fields (when (should-add-join-fields? stage)
                      (joins->fields joins))
        stage       (update stage :joins (fn [joins]
                                           (mapv (fn [{:keys [fields], :as join}]
                                                   (cond-> join
                                                     (keyword? fields) (dissoc :fields)))
                                                 joins)))]
    (append-join-fields-to-fields stage join-fields)))

(mu/defn resolve-joins :- ::lib.schema/query
  "1. Walk joins and merge defaults like `:strategy :left-join`
   2. Walk joins and resolve `:fields :all` to a vector of field refs
   3. Walk stages and merge in `:fields` from `:joins`"
  [query :- ::lib.schema/query]
  (-> query
      (lib.walk/walk (fn [query path-type path join]
                       (when (= path-type :lib.walk/join)
                         (resolve-join query path join))))
      (lib.walk/walk-stages (fn [__query _path stage]
                              (when (seq (:joins stage))
                                (merge-joins-fields stage))))))

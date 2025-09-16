(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `:field` clauses with `:source-field`
  options, and adds information to the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::joins
  "Schema for a non-empty sequence of ::joins. Unlike `:metabase.lib.schema.join/joins`, this does not enforce the
  constraint that all join aliases be unique."
  [:sequential {:min 1} ::lib.schema.join/join])

(mr/def ::unresolved-stage
  "Schema for the parts of the query we're modifying. For use in the various intermediate transformations in the
  middleware."
  [:map
   [:joins [:sequential ::lib.schema.join/join]]
   [:fields {:optional true} ::lib.schema/fields]])

(mr/def ::resolved-stage
  "Schema for the final results of this middleware."
  [:and
   ::unresolved-stage
   [:fn
    {:error/message "Valid MBQL query where `:joins` `:fields` is sequence of Fields or removed"}
    (fn [{:keys [joins]}]
      (every?
       (fn [{:keys [fields]}]
         (or
          (empty? fields)
          (sequential? fields)))
       joins))]])

(mu/defn- resolve-fields! :- :nil
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   joins                 :- ::joins]
  (lib.metadata/bulk-metadata-or-throw metadata-providerable
                                       :metadata/column
                                       (lib.util.match/match joins [:field _opts (id :guard pos-int?)] id))
  nil)

(mu/defn- resolve-tables! :- :nil
  "Add Tables referenced by `:joins` to the Query Processor Store. This is only really needed for implicit joins,
  because their Table references are added after `resolve-source-tables` runs."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   joins                 :- ::joins]
  (when-let [source-table-ids (not-empty (into #{}
                                               (comp (mapcat :stages)
                                                     (keep :source-table))
                                               joins))]
    (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/table source-table-ids))
  nil)

(def ^:private ^:deprecated default-join-alias
  "DEPRECATED: use version in lib"
  "__join")

(mu/defn- merge-defaults :- ::lib.schema.join/join
  [join]
  (merge {:strategy :left-join}
         (when (str/starts-with? (:alias join) default-join-alias)
           {:qp/keep-default-join-alias true})
         join))

(defn- join-fields [{:keys [alias], :as join} source-metadata]
  (when-not (seq source-metadata)
    (throw (ex-info (tru "Cannot use :fields :all in join against source query unless it has :source-metadata.")
                    {:join join})))
  (let [duplicate-ids (into #{}
                            (keep (fn [[item freq]]
                                    (when (> freq 1)
                                      item)))
                            (frequencies (map :id source-metadata)))]
    (for [{field-name :name
           base-type :base-type
           field-id :id} source-metadata]
      (-> (or (when (and field-id (not (contains? duplicate-ids field-id)))
                [:field {} field-id])
              [:field {:base-type base-type} field-name])
          lib/ensure-uuid
          (lib/with-join-alias alias)))))

(mu/defn- handle-all-fields :- ::lib.schema.join/join
  "Replace `:fields :all` in a join with an appropriate list of Fields."
  [query                                   :- ::lib.schema/query
   {:keys [stages fields], :as join} :- ::lib.schema.join/join]
  (merge
   join
   (when (= fields :all)
     {:fields (join-fields join (lib/returned-columns
                                 (-> (assoc query :stages stages)
                                     lib/append-stage)
                                 -1
                                 -1
                                 {:include-remaps? (not (get-in query [:middleware :disable-remaps?]))}))})))

(defn- ^:deprecated deduplicate-aliases
  "DEPRECATED -- no longer needed"
  []
  (let [unique-name-generator (lib.util/non-truncating-unique-name-generator)]
    (map (fn [join]
           (update join :alias unique-name-generator)))))

(mu/defn- resolve-references :- ::joins
  [query :- ::lib.schema/query
   joins :- ::joins]
  (resolve-tables! query joins)
  (u/prog1 (into []
                 (comp (map merge-defaults)
                       (map (partial handle-all-fields query))
                       (deduplicate-aliases))
                 joins)
    (resolve-fields! query <>)))

(declare resolve-joins-in-mbql-query-all-levels)

(mu/defn- resolve-join-source-queries :- ::joins
  [joins :- ::joins]
  (for [{:keys [source-query], :as join} joins]
    (cond-> join
      source-query resolve-joins-in-mbql-query-all-levels)))

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
  [{breakouts :breakout, aggregations :aggregation}]
  (every? empty? [aggregations breakouts]))

(defn- append-join-fields
  "This (supposedly) matches the behavior of [[metabase.lib.stage/add-cols-from-join]]. When we migrate this namespace
  to Lib we can maybe use that."
  [fields join-fields]
  ;; we shouldn't consider different type info to mean two Fields are different even if everything else is the same. So
  ;; give everything `:base-type` of `:type/*` (it will complain if we remove `:base-type` entirely from fields with a
  ;; string name)
  (println "(metabase.util/cprint-to-str fields):" (metabase.util/cprint-to-str (map lib.schema.util/mbql-clause-distinct-key fields))) ; NOCOMMIT
  (println "(metabase.util/cprint-to-str join-fields):" (metabase.util/cprint-to-str (map lib.schema.util/mbql-clause-distinct-key join-fields))) ; NOCOMMIT
  (into []
        (comp cat
              (m/distinct-by lib.schema.util/mbql-clause-distinct-key))
        [fields (lib/fresh-uuids join-fields)]))

(defn append-join-fields-to-fields
  "Add the fields from join `:fields`, if any, to the parent-level `:fields`."
  [stage join-fields]
  (cond-> stage
    (seq join-fields) (update :fields append-join-fields join-fields)))

(mu/defn- merge-joins-fields :- ::unresolved-stage
  "Append the `:fields` from `:joins` into their parent level as appropriate so joined columns appear in the final
  query results, and remove the `:fields` entry for all joins.

  If the parent-level query has breakouts and/or aggregations, this function won't append the joins fields to the
  parent level, because we should only be returning the ones from the ags and breakouts in the final results."
  [{:keys [joins], :as stage} :- ::unresolved-stage]
  (let [join-fields (when (should-add-join-fields? stage)
                      (joins->fields joins))
        ;; remove remaining keyword `:fields` like `:none` from joins
        stage       (update stage :joins (fn [joins]
                                           (mapv (fn [{:keys [fields], :as join}]
                                                   (cond-> join
                                                     (keyword? fields) (dissoc :fields)))
                                                 joins)))]
    (append-join-fields-to-fields stage join-fields)))

(mu/defn- resolve-joins-in-stage :- ::resolved-stage
  [query :- ::lib.schema/query
   stage :- ::lib.schema/stage]
  (-> stage
      (update :joins (comp resolve-join-source-queries
                           (partial resolve-references query)))
      merge-joins-fields))

;; TODO (Cam 9/10/25) -- once we convert this to Lib we can remove
;; the [[metabase.query-processor.middleware.ensure-joins-use-source-query/ensure-joins-use-source-query]] middleware
;; entirely
(mu/defn resolve-joins :- ::lib.schema/query
  "Add any Tables and Fields referenced by the `:joins` clause to the QP store."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query _path stage]
     (when (seq (:joins stage))
       (resolve-joins-in-stage query stage)))))

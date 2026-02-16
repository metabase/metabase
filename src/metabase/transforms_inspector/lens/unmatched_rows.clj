(ns metabase.transforms-inspector.lens.unmatched-rows
  "Drill-down lens triggered from join-analysis when null counts are significant.

   For each outer join, produces up to four sample cards:

   1. Truly unmatched  -- LHS key IS NOT NULL, RHS key IS NULL
   2. Null source key  -- LHS key IS NULL (can never match)
   3. Orphan RHS       -- RHS rows whose key doesn't exist in LHS (LEFT/FULL only)
   4. Orphan LHS       -- LHS rows whose key doesn't exist in RHS (RIGHT/FULL only)

   Trigger threshold: >5% null rate.  Alert threshold: >20%.
   Accepts `{:join_step N}` params to scope to a single join."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms-inspector.lens.core :as lens.core]
   [metabase.transforms-inspector.lens.query-util :as query-util]
   [metabase.util.i18n :refer [tru trun]]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :unmatched-rows 100 true)

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- field-meta
  "Field metadata for `field-id`, optionally scoped to `join-alias`."
  [mp field-id join-alias]
  (cond-> (lib.metadata/field mp field-id)
    join-alias (lib/with-join-alias join-alias)))

(defn- get-table-field-metas
  "All column metadata for `table-id`, optionally scoped to `join-alias`."
  [mp table-id join-alias]
  (let [fields (lib.metadata/fields mp table-id)]
    (mapv (fn [f]
            (cond-> f
              join-alias (lib/with-join-alias join-alias)))
          fields)))

(defn- find-table-for-join-alias
  "Look up the `:source-table` for the join with the given `alias`."
  [join-structure alias]
  (some #(when (= (:alias %) alias) (:source-table %)) join-structure))

(defn- make-base-unmatched-query
  "Stripped-down query with joins up to `step`, plus field metadata for both sides.
   Returns nil when the join condition can't be parsed."
  [ctx step]
  (let [{:keys [preprocessed-query join-structure db-id]} ctx
        mp (lib-be/application-database-metadata-provider db-id)
        mbql-join (nth (lib/joins preprocessed-query 0) (dec step))
        rhs-info (query-util/get-rhs-field-info (:conditions mbql-join))
        lhs-info (query-util/get-lhs-field-info (:conditions mbql-join))
        lhs-table-id (if (:join-alias lhs-info)
                       (find-table-for-join-alias join-structure (:join-alias lhs-info))
                       (lib/source-table-id preprocessed-query))
        base-table-id (lib/source-table-id preprocessed-query)]
    (when (and rhs-info lhs-info lhs-table-id)
      (let [lhs-field-metas (get-table-field-metas mp lhs-table-id (:join-alias lhs-info))
            base-field-metas (get-table-field-metas mp base-table-id nil)]
        (when (seq lhs-field-metas)
          {:base-query (query-util/bare-query-with-n-joins preprocessed-query step)
           :lhs-field-meta (field-meta mp (:field-id lhs-info) (:join-alias lhs-info))
           :rhs-field-meta (field-meta mp (:field-id rhs-info) (:join-alias rhs-info))
           :lhs-field-metas lhs-field-metas
           :base-field-metas base-field-metas})))))

(defn- make-truly-unmatched-query
  "Query for rows where LHS key exists but no RHS match was found (LHS NOT NULL, RHS NULL)."
  [ctx step]
  (when-let [{:keys [base-query lhs-field-meta rhs-field-meta lhs-field-metas]} (make-base-unmatched-query ctx step)]
    (-> base-query
        (lib/with-fields lhs-field-metas)
        (lib/filter (lib/not-null lhs-field-meta))
        (lib/filter (lib/is-null rhs-field-meta))
        (lib/limit 100))))

(defn- make-null-source-key-query
  "Query for rows where LHS key is NULL (can never match). Shows base-table columns."
  [ctx step]
  (when-let [{:keys [base-query lhs-field-meta base-field-metas]} (make-base-unmatched-query ctx step)]
    (-> base-query
        (lib/with-fields base-field-metas)
        (lib/filter (lib/is-null lhs-field-meta))
        (lib/limit 100))))

(defn- resolve-join-sides
  "Return `{:lhs-table-id :rhs-table-id :lhs-field-id :rhs-field-id}` for join `step`."
  [ctx step]
  (let [{:keys [preprocessed-query join-structure]} ctx
        mbql-join (nth (lib/joins preprocessed-query 0) (dec step))
        rhs-info (query-util/get-rhs-field-info (:conditions mbql-join))
        lhs-info (query-util/get-lhs-field-info (:conditions mbql-join))
        rhs-table-id (:source-table (nth join-structure (dec step)))
        lhs-table-id (if (:join-alias lhs-info)
                       (find-table-for-join-alias join-structure (:join-alias lhs-info))
                       (lib/source-table-id preprocessed-query))]
    (when (and rhs-info lhs-info rhs-table-id lhs-table-id)
      {:lhs-table-id lhs-table-id
       :rhs-table-id rhs-table-id
       :lhs-field-id (:field-id lhs-info)
       :rhs-field-id (:field-id rhs-info)})))

(defn- make-orphan-query
  "Query for rows in `source-table` whose key has no match in `target-table`.
   LEFT JOINs target, then filters source key NOT NULL / target key IS NULL."
  [ctx source-table-id target-table-id source-field-id target-field-id]
  (let [{:keys [db-id]} ctx
        mp (lib-be/application-database-metadata-provider db-id)
        source-table-meta (lib.metadata/table mp source-table-id)
        target-table-meta (lib.metadata/table mp target-table-id)
        source-field-meta (lib.metadata/field mp source-field-id)
        target-field-meta (lib.metadata/field mp target-field-id)
        source-field-metas (lib.metadata/fields mp source-table-id)
        check-alias "__orphan_check__"
        target-field-joined (lib/with-join-alias target-field-meta check-alias)]
    (when (seq source-field-metas)
      (-> (lib/query mp source-table-meta)
          (lib/join (-> (lib/join-clause target-table-meta
                                         [(lib/= source-field-meta target-field-meta)]
                                         :left-join)
                        (lib/with-join-alias check-alias)))
          (lib/with-fields source-field-metas)
          (lib/filter (lib/not-null source-field-meta))
          (lib/filter (lib/is-null target-field-joined))
          (lib/limit 100)))))

(defn- make-orphan-rhs-query
  "Orphan check: RHS rows with no matching LHS row."
  [ctx step]
  (when-let [{:keys [rhs-table-id lhs-table-id rhs-field-id lhs-field-id]} (resolve-join-sides ctx step)]
    (make-orphan-query ctx rhs-table-id lhs-table-id rhs-field-id lhs-field-id)))

(defn- make-orphan-lhs-query
  "Orphan check: LHS rows with no matching RHS row."
  [ctx step]
  (when-let [{:keys [rhs-table-id lhs-table-id rhs-field-id lhs-field-id]} (resolve-join-sides ctx step)]
    (make-orphan-query ctx lhs-table-id rhs-table-id lhs-field-id rhs-field-id)))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- truly-unmatched-card
  "Card: rows where LHS key exists but RHS didn't match."
  [ctx step params]
  (let [{:keys [join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [alias strategy]} join
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)]
    (when is-outer?
      (when-let [query (make-truly-unmatched-query ctx step)]
        {:id            (lens.core/make-card-id (str "truly-unmatched-" step) params)
         :section_id    "samples"
         :title         (tru "{0}: Rows with key but no match" alias)
         :display       :table
         :dataset_query query
         :metadata      {:card_type     :truly_unmatched
                         :join_step     step
                         :join_alias    alias
                         :join_strategy strategy}}))))

(defn- null-source-key-card
  "Card: rows where LHS key is NULL."
  [ctx step params]
  (let [{:keys [join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [alias strategy]} join
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)]
    (when is-outer?
      (when-let [query (make-null-source-key-query ctx step)]
        {:id            (lens.core/make-card-id (str "null-source-key-" step) params)
         :section_id    "samples"
         :title         (tru "{0}: Rows with NULL source key" alias)
         :display       :table
         :dataset_query query
         :metadata      {:card_type     :null_source_key
                         :join_step     step
                         :join_alias    alias
                         :join_strategy strategy}}))))

(defn- orphan-card
  "Card: rows on `side` (:rhs or :lhs) with no match on the other side.
   `strategies` is the set of join strategies for which this card applies."
  [ctx step params side strategies make-query-fn]
  (let [{:keys [join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [alias strategy]} join
        [side-label other-label] (if (= side :rhs) ["RHS" "LHS"] ["LHS" "RHS"])]
    (when (contains? strategies strategy)
      (when-let [query (make-query-fn ctx step)]
        {:id            (lens.core/make-card-id (str "orphan-" (name side) "-" step) params)
         :section_id    "samples"
         :title         (tru "{0}: {1} rows with no {2} match" alias side-label other-label)
         :display       :table
         :dataset_query query
         :metadata      {:card_type     (keyword (str "orphan_" (name side)))
                         :join_step     step
                         :join_alias    alias
                         :join_strategy strategy}}))))

(defn- orphan-rhs-card
  "Card: RHS rows with no LHS match (LEFT/FULL joins only)."
  [ctx step params]
  (orphan-card ctx step params :rhs #{:left-join :full-join} make-orphan-rhs-query))

(defn- orphan-lhs-card
  "Card: LHS rows with no RHS match (RIGHT/FULL joins only)."
  [ctx step params]
  (orphan-card ctx step params :lhs #{:right-join :full-join} make-orphan-lhs-query))

(defn- cards-for-join
  "All unmatched-row cards for a single join step."
  [ctx step params]
  (keep identity [(truly-unmatched-card ctx step params)
                  (null-source-key-card ctx step params)
                  (orphan-rhs-card ctx step params)
                  (orphan-lhs-card ctx step params)]))

(defn- all-cards
  "Sample cards for all outer joins, optionally filtered by `:join_step` param."
  [ctx params]
  (let [{:keys [join-structure]} ctx
        ;; Parse to int - may be string from query params
        requested-step (some-> (:join_step params) str parse-long)
        join-count (count join-structure)]
    (into []
          (mapcat (fn [step]
                    (when (or (nil? requested-step) (= step requested-step))
                      (cards-for-join ctx step params))))
          (range 1 (inc join-count)))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :unmatched-rows
  [_ ctx]
  ;; Only applicable for MBQL with outer joins
  (and (= (:source-type ctx) :mbql)
       (:has-joins? ctx)
       (:preprocessed-query ctx)
       (some #(contains? #{:left-join :right-join :full-join} (:strategy %))
             (:join-structure ctx))))

(defmethod lens.core/lens-metadata :unmatched-rows
  [_ _ctx]
  {:id           "unmatched-rows"
   :display_name (tru "Unmatched Rows")
   :description  (tru "Sample rows that failed to join")
   :complexity   {:level :slow}})

(defmethod lens.core/make-lens :unmatched-rows
  [lens-type ctx params]
  (let [cards (all-cards ctx params)
        outer-join-count (count (filter #(contains? #{:left-join :right-join :full-join} (:strategy %))
                                        (:join-structure ctx)))
        requested-step (:join_step params)
        title (when requested-step
                (tru "Unmatched Rows - Join {0}" requested-step))]
    (cond-> (lens.core/with-metadata lens-type ctx
              {:summary  (if (seq cards)
                           {:text       (trun "Analyzing unmatched rows for {0} outer join"
                                              "Analyzing unmatched rows for {0} outer joins"
                                              outer-join-count)
                            :highlights [{:label (tru "Outer Joins") :value outer-join-count}
                                         {:label (tru "Sample Cards") :value (count cards)}]}
                           {:text       (tru "No outer joins with detectable join conditions")
                            :highlights []})
               :sections [{:id     "samples"
                           :title  (tru "Unmatched Row Samples")
                           :layout :flat}]
               :cards    cards})
      title (assoc :display_name title))))

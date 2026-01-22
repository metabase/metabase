# Plan: Optimize `can_run_adhoc_query` Computation

## Summary

Optimize `can_run_adhoc_query` computation for both OSS and EE by avoiding expensive query preprocessing.

**Current cost:** N cards × full query preprocessing (~3-15ms each)
**Proposed cost:**
- **OSS:** Extract source card IDs (lightweight) + DB-level permission check
- **EE:** 1 recursive SQL query against dependency table

## OSS Optimization

On OSS, table-level blocking doesn't exist. The permission model simplifies to:

| Check | What's Required |
|-------|-----------------|
| Source cards | Collection read permission |
| Database | `create-queries` ≠ `:no` (`:query-builder` for MBQL, `:query-builder-and-native` for native) |

**Key insight:** We can use `lib/all-source-card-ids` to extract card references without full `preprocess-query`. This walks the query AST but doesn't expand source cards or resolve tables.

```clojure
;; Lightweight extraction (no preprocessing)
(lib/all-source-card-ids query)  ;; → #{card-id ...}
(lib/any-native-stage? query)    ;; → boolean
```

## EE Optimization (with Dependencies Feature)

| Dependency Path | Permission Required |
|-----------------|---------------------|
| Card → Table (direct) | view-data + create-queries |
| Card → Card | collection read |
| Card → Card → Table (transitive) | view-data only |

The `is_direct` flag in the recursive CTE distinguishes direct vs transitive table dependencies.

## Files to Create

### 1. `enterprise/backend/src/metabase_enterprise/queries/adhoc_query_perms.clj`

EE implementation using recursive CTE against dependency table.

### 2. `enterprise/backend/test/metabase_enterprise/queries/adhoc_query_perms_test.clj`

Test coverage for EE-specific behavior (recursive CTE, staleness fallback).

## Files to Modify

### 1. `src/metabase/queries/models/card.clj`

**Change:** Replace expensive `query-perms/can-run-query?` with lightweight check

```clojure
;; NEW: Lightweight OSS permission check (no query preprocessing)
(defn- can-run-adhoc-query-oss?
  "Check if current user can run ad-hoc query for card.
   Lightweight: extracts source cards without full query preprocessing."
  [{:keys [database_id dataset_query]}]
  (let [query (lib/query (lib-be/application-database-metadata-provider database_id)
                         dataset_query)
        source-card-ids (lib/all-source-card-ids query)
        native? (lib/any-native-stage? query)
        required-perm (if native? :query-builder-and-native :query-builder)]
    (and
     ;; User has query permission on the database
     (not= :no (perms/full-db-permission-for-user
                api/*current-user-id* :perms/create-queries database_id))
     (or (not native?)
         (= required-perm (perms/full-db-permission-for-user
                           api/*current-user-id* :perms/create-queries database_id)))
     ;; User can read all source cards
     (every? mi/can-read?
             (when (seq source-card-ids)
               (t2/select :model/Card :id [:in source-card-ids]))))))

;; defenterprise wrapper for EE override
(defenterprise compute-can-run-adhoc-query-batch
  "Compute can_run_adhoc_query for a batch of cards."
  metabase-enterprise.queries.adhoc-query-perms
  [cards]
  ;; OSS: use lightweight check
  (into {}
        (map (fn [{card-id :id :as card}]
               [card-id (can-run-adhoc-query-oss? card)]))
        (filter (comp seq :dataset_query) cards)))

;; Simplify with-can-run-adhoc-query - remove expensive prefetching
(mu/defn with-can-run-adhoc-query
  [cards :- [:maybe [:sequential ::queries.schema/card]]]
  (perms/prime-db-cache (into #{} (map :database_id cards)))
  (mi/instances-with-hydrated-data
   cards :can_run_adhoc_query
   #(compute-can-run-adhoc-query-batch (filter (comp seq :dataset_query) cards))
   :id
   {:default false}))
```

## Recursive CTE Query

```clojure
(defn transitive-deps-for-cards-query
  "Build HoneySQL query for transitive dependencies with directness tracking."
  [card-ids]
  {:with-recursive
   [[[:transitive_deps {:columns [:start_card_id :to_entity_type :to_entity_id :is_direct_table]}]
     {:union-all
      [;; Base case: direct dependencies
       {:select [[:from_entity_id :start_card_id]
                 :to_entity_type
                 :to_entity_id
                 [[:case [:= :to_entity_type [:inline "table"]]
                         [:inline 1]
                   :else [:inline 0]]
                  :is_direct_table]]
        :from   [:dependency]
        :where  [:and
                 [:= :from_entity_type [:inline "card"]]
                 [:in :from_entity_id card-ids]]}
       ;; Recursive case: follow card->X edges
       {:select [:td.start_card_id
                 :d.to_entity_type
                 :d.to_entity_id
                 [[:inline 0] :is_direct_table]]
        :from   [[:dependency :d]]
        :join   [[:transitive_deps :td]
                 [:and
                  [:= :d.from_entity_type :td.to_entity_type]
                  [:= :d.from_entity_id :td.to_entity_id]]]
        :where  [:= :td.to_entity_type [:inline "card"]]}]}]]
   :select   [:start_card_id :to_entity_type :to_entity_id
              [[:max :is_direct_table] :is_direct]]
   :from     [:transitive_deps]
   :group-by [:start_card_id :to_entity_type :to_entity_id]})
```

## Staleness Handling

Check `dependency_analysis_version` and fall back to OSS for stale cards:

```clojure
(defn- partition-by-staleness
  "Split card IDs into fresh (use deps) and stale (use fallback)."
  [card-ids]
  (let [current-version models.dependency/current-dependency-analysis-version
        stale-ids (t2/select-fn-set :id :model/Card
                                    :id [:in card-ids]
                                    :dependency_analysis_version [:< current-version])]
    {:fresh (remove stale-ids card-ids)
     :stale stale-ids}))
```

## Native Query Handling

Native queries are handled by checking `dataset_query` type:

```clojure
(defn- native-query? [card]
  (= :native (-> card :dataset_query :type)))

(defn- has-native-perms? [db-id]
  (= :query-builder-and-native
     (perms/full-db-permission-for-user
      api/*current-user-id* :perms/create-queries db-id)))
```

Native queries require `create-queries: :query-builder-and-native` on the database regardless of table dependencies.

## Integration with Block Permissions

The existing `check-block-permissions` middleware (EE) checks view-data on ALL tables in the preprocessed query. Our optimization handles the same tables via the transitive dependency graph, so block permissions will be respected.

## Feature Gating

```clojure
(defenterprise compute-can-run-adhoc-query-batch
  "..."
  metabase-enterprise.queries.adhoc-query-perms
  :feature :dependencies  ;; Requires dependencies premium feature
  [cards]
  ;; OSS fallback
  ...)
```

## Implementation Steps

### Phase 1: OSS Optimization
1. **Add `can-run-adhoc-query-oss?`** - lightweight check using `lib/all-source-card-ids`
2. **Wrap in `defenterprise`** for EE override
3. **Simplify `with-can-run-adhoc-query`** - remove expensive prefetching
4. **Write tests** for OSS permission scenarios
5. **Benchmark** OSS improvement

### Phase 2: EE Optimization (requires dependencies feature)
1. **Create EE namespace** with recursive CTE query builder
2. **Implement EE version** with:
   - Transitive deps fetch via CTE
   - Direct vs transitive table permission checks
   - Staleness detection and fallback
3. **Write EE tests** covering dependency graph scenarios
4. **Benchmark** EE improvement vs OSS

## Verification

### OSS Tests
1. Card with no source cards → check DB permission only
2. Card with source cards → check collection read + DB permission
3. Native query → requires `:query-builder-and-native`
4. User blocked from DB → returns false
5. User can't read source card → returns false

### EE Tests
1. Direct table dependency → needs view-data + create-queries
2. Transitive table dependency → needs view-data only
3. Stale dependency_analysis_version → falls back to OSS
4. Recursive CTE handles deep card chains (A → B → C → table)

### Performance
```clojure
;; Benchmark with 500 cards
(time (t2/hydrate cards :can_run_adhoc_query))
;; Before: ~2-4 seconds
;; After OSS: ~200-400ms (no preprocessing)
;; After EE: ~50-100ms (single CTE)
```

### Manual Testing
- GET `/api/collection/:id/items?models=card&include_can_run_adhoc_query=true`
- Verify correct permissions with large collection (500+ cards)
- Check SQL logs: should see 1 CTE query (EE) or N lightweight queries (OSS), not N preprocessing calls

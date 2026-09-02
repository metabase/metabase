(ns dev.hugsql-spike.search-collection
  "SPIKE (not production): the search `collection` arm as fully static SQL, plus a golden
  equivalence check against the live HoneySQL implementation.

  This exists to answer one question: does a real search arm convert? The composition of arms is
  handled separately in [[dev.hugsql-spike.search-union]]; this is about a single arm's WHERE
  clause, which is where the difficulty actually lives.

  ## What made it look impossible

  Compiling the card arm across 40 filter combinations produced 40 distinct SQL shapes. That reads
  as \"structure varies with the request, so static SQL is out\". It is an artifact: HoneySQL
  *omits* a clause entirely when its `(when ...)` is false, so the text differs while the query
  does not. Written with every filter present and flag-gated, one statement covers every
  combination.

  ## The techniques, all previously proven in this POC

  - int flags rather than `(when ...)` fragments (also gives Postgres a param type, which a bare
    `? IS NULL` does not)
  - a multi-flag encoding for the 5-valued personal-collection mode: `want-personal` x `mine-only`
  - `:value*:` for the readable-collection id set (varies the placeholder count, never the text)
  - narrow-then-filter: the permission-scoped id set leads and is sargable, so the flag-gated
    predicates apply to an already-narrow row set at no measurable cost

  ## Two differences from the original worth a reviewer's attention

  - The current user id is a `:value:` param here. The original emits it as a SQL *literal* via an
    explicit `[:inline current-user-id]` in `collection/visible-collection-filter-clause`
    (collection.clj:874; `data_permissions/sql.clj:274` does the same for the permission graph).
    Search arms inherit it through `add-collection-join-and-where-clauses` rather than choosing it.

    This is a deliberate call upstream, not an oversight, and the tradeoff cuts both ways: a
    literal lets the planner use `permissions_group_membership` selectivity statistics for that
    specific user, while a param gives one cached statement for all users but a generic estimate.
    Which wins is the custom-plan-vs-generic-plan question, and it is unmeasured here. Treat this
    as a behavioural difference to check before shipping, not as a fix. (`current-user-id` is
    session-derived and an integer, so neither form is an injection concern.)

  - `verified` and `created-by` throw upstream for collection (`:verified filter for collection is
    not supported`), so the arm provably never carries them. That is invisible in the HoneySQL
    version, where it is an absence.

  Run it: build a param map with [[params-for]] and diff against the HoneySQL arm with
  [[compare-mode]]. `:same` means the two agree on the id set."
  (:require
   [clojure.set :as set]
   [hugsql.core :as hugsql]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(declare collection-arm)

(hugsql/def-sqlvec-fns "spike_search_collection.sql")

(defn- honeysql-ids
  "Ids from the live HoneySQL arm, for `search-ctx`."
  [search-ctx]
  (let [sqfm (deref (requiring-resolve 'metabase.search.in-place.legacy/search-query-for-model))]
    (set (map :id (t2/query (sqfm "collection" search-ctx))))))

(defn- hugsql-ids
  "Ids from the static arm, for a param map."
  [params]
  (set (map :id (t2/query (collection-arm params)))))

(defn compare-mode
  "`:same`, or the symmetric difference when the two implementations disagree."
  [search-ctx params]
  (let [a (honeysql-ids search-ctx)
        b (hugsql-ids params)]
    (if (= a b)
      :same
      {:honeysql-only (set/difference a b)
       :hugsql-only   (set/difference b a)})))

(def personal-mode->flags
  "The 5 `filter-items-in-personal-collection` values as `want-personal`/`mine-only` int flags.
  `nil`/\"all\" is -1 (no restriction); 2 is the mine-or-not-personal union used by
  exclude-others."
  {nil               {:want-personal -1 :mine-only 0}
   "all"             {:want-personal -1 :mine-only 0}
   "only"            {:want-personal 1  :mine-only 0}
   "only-mine"       {:want-personal 1  :mine-only 1}
   "exclude"         {:want-personal 0  :mine-only 0}
   "exclude-others"  {:want-personal 2  :mine-only 0}})

(defn params-for
  "Build the static arm's param map from the same inputs the HoneySQL arm takes.

  `readable-collection-ids` must be non-empty (an empty `IN ()` is a syntax error); pass `[nil]`
  when the user can read nothing, which matches no row."
  [{:keys [current-user-id search-term archived? superuser? readable-collection-ids
           trash-collection-id namespace* personal-mode]}]
  (merge {:current-user-id         current-user-id
          :search-term             search-term
          :archived                (boolean archived?)
          :is-superuser            (if superuser? 1 0)
          :readable-collection-ids (or (seq readable-collection-ids) [nil])
          :trash-collection-id     (or trash-collection-id -1)
          :namespace               namespace*
          :personal-root           (str "/" current-user-id "/%")}
         (personal-mode->flags personal-mode)))

(def findings
  "What this spike established."
  {:established
   ["A real search arm converts. All six checked modes (base, archived, and the four
     personal-collection modes) return identical id sets to the HoneySQL original on the same data,
     with real personal collections present so the personal modes discriminate."
    "The '40 distinct shapes' figure was a HoneySQL artifact, not a property of the query."
    "The static version turns the inlined current user id into a bound param. That is a real
     behavioural difference (one cached statement for all users, vs per-user plans with real
     selectivity stats) and it is NOT established which is faster -- see the ns docstring."]

   :not-yet
   ["13 of the 14 arms remain. `collection` is among the simpler ones (2 joins); `card` has 8 and
     carries last-edit and moderated-status decoration."
    "CTE hoisting is untouched. extract-and-hoist-ctes lifts :with clauses out of arms before the
     union; a composed static statement needs the same handling."
    "The outer wrapper (ORDER BY over the union, limit) needs the CASE-sort-key treatment already
     used for task_history."
    "Only checked on H2 so far. The permission subquery and CONCAT-based descendant matching are
     the parts most likely to diverge on Postgres/MySQL."]})

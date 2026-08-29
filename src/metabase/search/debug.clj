(ns metabase.search.debug
  "Diagnostics for the search debug API: explain why a given entity does *not* appear in a search query's results.
  See [[diagnose]]."
  (:require
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private DiagnosisResult
  [:map [:type :keyword] [:details :map]])

(defn- not-searchable-result
  "Engine-independent first stage: does the spec say this row should be indexed at all? `nil` means it should."
  [expected-model expected-id]
  (case (search.ingestion/indexable-row? expected-model expected-id)
    :no-spec   {:type :not-searchable :details {:reason :no-spec :search-model expected-model}}
    :not-found {:type :not-searchable :details {:reason :does-not-exist :search-model expected-model}}
    :excluded  {:type :not-searchable :details {:reason :excluded-by-where :search-model expected-model}}
    :indexable nil))

(def ^:private permission-exclusions
  "`:excluded-by` keys that mean an *access-control* denial rather than a query filter the user chose. Engines emit
  these under `:filtered`; we promote them to `:not-permitted` so the debug consumer can tell 'you can't see it'
  apart from 'your query excluded it'."
  #{:collection-permissions :table-permissions :permissions})

(defn- split-not-permitted
  "Promote a permission-denial `:filtered` result to `:not-permitted` (see [[permission-exclusions]])."
  [result]
  (cond-> result
    (and (= :filtered (:type result))
         (contains? permission-exclusions (-> result :details :excluded-by)))
    (assoc :type :not-permitted)))

(defn- in-results?
  "Run the actual ranked search and check whether `(expected-model, expected-id)` is in the returned page."
  [search-ctx expected-model expected-id]
  (->> (:data (search.impl/search search-ctx))
       (some (fn [row] (and (= expected-model (:model row)) (= expected-id (:id row)))))
       boolean))

(defn- terminal-result
  "Turn an engine `:candidate` into the terminal `:matched` (actually returned) or `:ranked-out` (would be a
  candidate, but ranked below the result/distance limit)."
  [search-ctx expected-model expected-id candidate]
  (if (in-results? search-ctx expected-model expected-id)
    {:type :matched     :details (assoc (:details candidate) :would-be-candidate? true)}
    {:type :ranked-out  :details (assoc (:details candidate) :would-be-candidate? true
                                        :note "passes all stages; ranked below the result/distance limit")}))

(mu/defn diagnose :- DiagnosisResult
  "Explain why `expected-model`/`expected-id` does not appear in the results of the search described by `search-ctx`.
  Returns `{:type ..., :details ...}` for the *first* disqualifying stage, in this precedence order:

  - `:not-searchable`     the spec says this row should not be indexed (no spec, or its `:where` excludes it).
  - `:missing-from-index` the spec would index it, but it is absent from the resolved engine's active index.
  - `:not-permitted`      present in the index but excluded by an access-control check (the user can't see it).
  - `:filtered`           present in the index but excluded by a structural filter the query chose
                          (archived, collection scope, created-by, models, …) — everything except the match.
  - `:not-matching`       passes the filters but does not match the fulltext/semantic query.
  - `:matched`            passes every stage and is actually present in the returned page.
  - `:ranked-out`         passes every stage but was ranked below the result/distance limit.

  Permission checks run from `search-ctx`'s `:current-user-id` perspective, so callers can diagnose on behalf of
  another user (see the `for_user_id` parameter of the API). The engine-owned stages (`:missing-from-index`,
  `:filtered`/`:not-permitted`, `:not-matching`, `:candidate`) come from [[metabase.search.engine/diagnose]]; the
  engine-independent stages are decided here. `:details` always carries the resolved engine. `:not-searchable`
  reflects current spec/DB truth, so it wins even if a stale index row lingers."
  [search-ctx        :- :map
   expected-model    :- ms/NonBlankString
   expected-id       :- pos-int?]
  (let [engine-details {:resolved-engine (:search-engine search-ctx)
                        :default-engine  (search.engine/default-engine)}
        result         (or (not-searchable-result expected-model expected-id)
                           (let [r (split-not-permitted
                                    (search.engine/diagnose search-ctx expected-model expected-id))]
                             (if (= :candidate (:type r))
                               (terminal-result search-ctx expected-model expected-id r)
                               r)))]
    (update result :details merge engine-details)))

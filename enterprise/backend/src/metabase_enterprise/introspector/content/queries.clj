(ns metabase-enterprise.introspector.content.queries
  "Federated SQL queries for the admin Introspector. Each entity-type query produces rows
  with `is_stale`, `is_broken`, `is_unreferenced` flags so the UI can render multi-badge rows
  and sort/paginate across condition types in one round-trip.

  Condition semantics:
  - stale        — `last_used_at` / `last_viewed_at` older than the cutoff, AND not load-bearing
                   (no subscriptions, sandboxes, verified moderation, embedding, public sharing).
                   Matches `metabase-enterprise.stale.impl/find-stale-query`. See the TODO below
                   about factoring with that module.
  - broken       — has a row in `analysis_finding` with `result = false`. Same source of truth as
                   `/api/ee/dependencies/graph/broken`.
  - unreferenced — nothing in the `dependency` table points at this entity (`to_entity_*`).

  POC: stale exclusion rules are inlined here rather than reused from
  `metabase-enterprise.stale.impl`. Factor when productizing."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.time Duration LocalDateTime OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

;;; -------------------------------------- helpers --------------------------------------

(defn- card-stale-cte
  "Inner query producing the set of `report_card.id`s that are stale, given a cutoff date.
  Mirrors the WHERE clause of `metabase-enterprise.stale.impl/find-stale-query :model/Card`."
  [^java.time.LocalDate cutoff-date]
  {:select [[:report_card.id :id]]
   :from   [:report_card]
   :left-join [:moderation_review [:and
                                   [:= :moderation_review.moderated_item_id :report_card.id]
                                   [:= :moderation_review.moderated_item_type (h2x/literal "card")]
                                   [:= :moderation_review.most_recent true]
                                   [:= :moderation_review.status (h2x/literal "verified")]]
               :pulse_card        [:= :pulse_card.card_id :report_card.id]
               :pulse             [:and
                                   [:= :pulse_card.pulse_id :pulse.id]
                                   [:= :pulse.archived false]]
               :sandboxes         [:= :sandboxes.card_id :report_card.id]
               :collection        [:= :collection.id :report_card.collection_id]]
   :where  [:and
            [:= :sandboxes.id nil]
            [:= :pulse.id nil]
            [:= :moderation_review.id nil]
            [:= :report_card.archived false]
            [:<= :report_card.last_used_at cutoff-date]
            [:= :collection.type nil]]})

(defn- dashboard-stale-cte
  [^java.time.LocalDate cutoff-date]
  {:select [[:report_dashboard.id :id]]
   :from   [:report_dashboard]
   :left-join [:pulse              [:and
                                    [:= :pulse.archived false]
                                    [:= :pulse.dashboard_id :report_dashboard.id]]
               :collection         [:= :collection.id :report_dashboard.collection_id]
               :moderation_review  [:and
                                    [:= :moderation_review.moderated_item_id :report_dashboard.id]
                                    [:= :moderation_review.moderated_item_type (h2x/literal "dashboard")]
                                    [:= :moderation_review.most_recent true]
                                    [:= :moderation_review.status (h2x/literal "verified")]]]
   :where  [:and
            [:= :pulse.id nil]
            [:= :moderation_review.id nil]
            [:= :report_dashboard.archived false]
            [:<= :report_dashboard.last_viewed_at cutoff-date]
            [:= :collection.type nil]]})

(defn- broken-ids-cte
  "Ids of entities with a failed analysis finding (analyzed_entity_type = entity-type-str)."
  [entity-type-str]
  {:select [[:analyzed_entity_id :id]]
   :from   [:analysis_finding]
   :where  [:and
            [:= :analyzed_entity_type (h2x/literal entity-type-str)]
            [:= :result false]]})

(defn- unreferenced-cards-cte []
  {:select-distinct [[:report_card.id :id]]
   :from   [:report_card]
   :left-join [:dependency [:and
                            [:= :dependency.to_entity_id :report_card.id]
                            [:= :dependency.to_entity_type (h2x/literal "card")]]]
   :where  [:and
            [:= :report_card.archived false]
            [:= :dependency.id nil]]})

(defn- unreferenced-dashboards-cte []
  {:select-distinct [[:report_dashboard.id :id]]
   :from   [:report_dashboard]
   :left-join [:dependency [:and
                            [:= :dependency.to_entity_id :report_dashboard.id]
                            [:= :dependency.to_entity_type (h2x/literal "dashboard")]]]
   :where  [:and
            [:= :report_dashboard.archived false]
            [:= :dependency.id nil]]})

(defn- unreferenced-transforms-cte
  "A transform is unreferenced when no `dependency` row points at either the transform itself
  or its `target_table_id`. Broader than the card/dashboard equivalents because consumers of
  a transform's output table show up as edges on the table, not the transform.

  Filters out trashed transforms (`archived = true`); the Introspector shouldn't surface
  rows that are already in the Trash."
  []
  {:select-distinct [[:transform.id :id]]
   :from   [:transform]
   :left-join [[:dependency :dep_xform]
               [:and
                [:= :dep_xform.to_entity_id :transform.id]
                [:= :dep_xform.to_entity_type (h2x/literal "transform")]]
               [:dependency :dep_table]
               [:and
                [:not= :transform.target_table_id nil]
                [:= :dep_table.to_entity_id :transform.target_table_id]
                [:= :dep_table.to_entity_type (h2x/literal "table")]]]
   :where  [:and
            [:= :transform.archived false]
            [:= :dep_xform.id nil]
            [:= :dep_table.id nil]]})

(defn- transform-target-missing-broken-cte
  "Transforms whose target table is inactive **and that have succeeded at
  least once** — the broken signal. We require a prior success rather than
  just any run because the target table only ever gets created by a
  successful run; a never-succeeded transform with a missing target hasn't
  *lost* its table, it never had one. That's a `latest-run-failed` or
  `transform-stale-cte` problem, not `target-table-missing`.

  Trashed transforms (`archived = true`) are excluded."
  []
  {:select [[:transform.id :id]]
   :from   [:transform]
   :join   [:metabase_table [:= :metabase_table.id :transform.target_table_id]]
   :where  [:and
            [:= :transform.archived false]
            [:not= :transform.target_table_id nil]
            [:= :metabase_table.active false]
            [:exists {:select [[[:inline 1]]]
                      :from   [[:transform_run :__has_runs]]
                      :where  [:and
                               [:= :__has_runs.transform_id :transform.id]
                               [:= :__has_runs.status (h2x/literal "succeeded")]]}]]})

(defn- transform-stale-cte
  "Transforms that look abandoned rather than broken:
    - have NEVER been run (no `transform_run` rows), AND
    - have no live target table (either `target_table_id IS NULL` or the
      referenced `metabase_table.active = false`), AND
    - were created before the staleness cutoff.

  Captures transforms that were set up long ago, never executed, and whose
  output table doesn't exist — surface them so admins can clean up rather
  than treating them as broken (which implies something *was* working)."
  [^java.time.LocalDate cutoff-date]
  {:select [[:transform.id :id]]
   :from   [:transform]
   :left-join [[:metabase_table :mt] [:= :mt.id :transform.target_table_id]]
   :where  [:and
            [:= :transform.archived false]
            ;; No runs of any kind — see also the comment on
            ;; `transform-target-missing-broken-cte` re: this distinction.
            [:not [:exists {:select [[[:inline 1]]]
                            :from   [[:transform_run :__tr]]
                            :where  [:= :__tr.transform_id :transform.id]}]]
            ;; No active target table — either never had one or it's been
            ;; dropped/deactivated.
            [:or
             [:= :transform.target_table_id nil]
             [:= :mt.active false]]
            ;; Old enough — using `transform.created_at` since there's no
            ;; `last_used_at` for transforms.
            [:<= :transform.created_at cutoff-date]]})

(defn- transform-latest-failed-cte
  "Transforms whose most recent finished run (`is_active IS NULL`) ended in `:failed` status.
  Captures Python and SQL runtime errors that surface only at execution time.

  Uses a derived table rather than a `WITH` clause so the result composes inside a
  `UNION ALL` (some dialects, including H2, reject `WITH ... SELECT` as a UNION arm)."
  []
  {:select-distinct [[:fr.transform_id :id]]
   :from   [[{:select [:transform_id :status
                       [[:over [[:row_number]
                                {:partition-by :transform_id
                                 :order-by     [[:start_time :desc]]}]]
                        :rn]]
              :from   [:transform_run]
              :where  [:= :is_active nil]}
             :fr]]
   :where  [:and
            [:= :fr.rn [:inline 1]]
            [:= :fr.status (h2x/literal "failed")]]})

(defn- broken-transforms-cte
  "Combined broken signal for transforms:
    - analysis-finding error, OR
    - target table missing **and at least one run has succeeded historically**
      — i.e. the table was created at some point and has since been
      dropped/deactivated. Transforms whose target table never existed
      (no succeeded runs) are not flagged here; the real signal there is
      `latest-run-failed` (the failure itself) or `transform-stale-cte`
      (the abandoned config), OR
    - the latest finished run failed.

  Uses `:union` (deduplicating) so a transform that trips multiple broken
  signals appears once — keeps the outer LEFT JOIN cardinality-preserving."
  []
  {:union [(broken-ids-cte "transform")
           (transform-target-missing-broken-cte)
           (transform-latest-failed-cte)]})

(defn- conditions-filter-clause
  "Given a set of requested conditions (e.g. #{:broken :stale}), return a HoneySQL clause
  that requires at least one of them to be present on the row."
  [conditions]
  (let [parts (cond-> []
                (contains? conditions :stale)        (conj [:not= :stale.id nil])
                (contains? conditions :broken)       (conj [:not= :broken.id nil])
                (contains? conditions :unreferenced) (conj [:not= :unref.id nil]))]
    (if (empty? parts)
      ;; default: any condition
      [:or
       [:not= :stale.id nil]
       [:not= :broken.id nil]
       [:not= :unref.id nil]]
      (into [:or] parts))))

(defn- sort-clause
  "ORDER BY clause for the federated card/dashboard queries.

  `name-col` is the *fully qualified* name column for the entity table (e.g.
  `:report_card.name`). Required because we now LEFT JOIN `collection` to
  surface `collection.name`, so an unqualified `name` reference is ambiguous
  to Postgres."
  [name-col sort-column sort-direction]
  (let [col (case sort-column
              :name         [:lower name-col]
              :last_used_at :last_used_at
              [:lower name-col])
        dir (case sort-direction
              :desc :desc
              :asc)]
    [[col dir]]))

;;; -------------------------------- per-row reasons -----------------------------------
;;
;; Each row in the introspector carries up to three flags (`:is_broken`, `:is_stale`,
;; `:is_unreferenced`). The FE shows a stack of `{:flag :code :detail}` reasons under
;; the row name to explain *why* a row landed in each bucket. Broken reasons come from
;; `analysis_finding_error`; stale and unreferenced reasons are synthesised in-process
;; from the federated row's flag columns (no extra DB hit).

(defn- resolve-source-names
  "Bulk-resolve a seq of `[source-entity-type source-entity-id]` pairs to
  display names. Two queries — one for tables, one for cards.

  Returns `{[source_entity_type source_entity_id] -> display-name}`."
  [pairs]
  (let [grouped     (group-by first (filter (fn [[t id]] (and t id)) pairs))
        table-ids   (mapv second (get grouped "table" []))
        card-ids    (mapv second (get grouped "card" []))
        table-rows  (when (seq table-ids)
                      (t2/query
                       {:select [:id :name :schema]
                        :from   [:metabase_table]
                        :where  [:in :id (vec table-ids)]}))
        card-rows   (when (seq card-ids)
                      (t2/query
                       {:select [:id :name]
                        :from   [:report_card]
                        :where  [:in :id (vec card-ids)]}))]
    (into {}
          (concat
           (for [{:keys [id name schema]} table-rows]
             [["table" id] (if schema (str schema "." name) name)])
           (for [{:keys [id name]} card-rows]
             [["card" id] name])))))

(defn- sanitize-exception-message
  "Tidy up a Java/Python exception string for human display:
   - strip the leading FQ wrapper class(es) (e.g. `java.lang.RuntimeException: `,
     `java.nio.file.ClosedFileSystemException: `) when followed by another message
   - if the only thing left is a bare FQ class name, keep just the short class
   - collapse doubled `Foo: Foo: …` prefixes (common in nested Python -> Java)
   - trim trailing whitespace."
  [s]
  (when (seq s)
    (let [;; First strip prefix wrapper classes that have ": message" after them.
          peeled (str/replace s
                              #"^(?:[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_$]+)+:\s+)+"
                              "")
          ;; If the result IS a bare FQ class with no message, shrink to short name.
          short  (if (re-matches #"[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_$]+)+" peeled)
                   (last (str/split peeled #"\."))
                   peeled)
          ;; `PermissionError: PermissionError: …` -> `PermissionError: …`
          deduped (str/replace short
                               #"^([A-Za-z_]+(?:Error|Exception)):\s+\1:\s+"
                               "$1: ")]
      (str/trim deduped))))

(defn- format-source-clause
  "Render the `in X` fragment of a humanised reason, given a source name and
  whether that name describes multiple candidate sources (a comma-joined
  list emitted by `enrich-error` when the parser saw several candidate
  tables for the same column reference).

  Returns nil when there's no source name to render."
  [source-name multi?]
  (when (seq source-name)
    (if multi?
      ;; Multi: pre-format every candidate with backticks so the sentence
      ;; reads cleanly even when the list is long.
      (->> (str/split source-name #",\s*")
           (map #(str "`" % "`"))
           (str/join ", ")
           (str " in any of "))
      (str " in `" source-name "`"))))

(defn- humanize-error-detail
  "Translate `(error_type, error_detail, source-name, multi?)` into a single
  human-readable sentence.

  `source-name` is the resolved name of the row's `source_entity_*` reference
  (a `schema.table` or card name) — or nil if the analyzer couldn't attribute
  the error to a specific source. `multi?` is true when the name is a
  comma-joined list of candidate tables (the parser saw several and couldn't
  narrow down).

  We do **not** invent sources by enumerating the entity's declared
  dependencies — every fragment comes from what the analyzer itself recorded."
  [error-type error-detail source-name multi?]
  (let [detail (some-> error-detail str/trim not-empty)
        col    (some-> detail (str/replace #"[`\"]" ""))
        in-src (format-source-clause source-name multi?)]
    (case error-type
      "missing-column"
      (cond
        (and col in-src)
        (str "Missing column `" col "`" in-src
             " — referenced but not found.")

        col
        (str "Missing column `" col "` — referenced in the SQL but the "
             "analyzer couldn't attribute it to a specific source. A source "
             "table referenced by the query may no longer exist.")

        :else
        "A referenced column is missing from the source(s).")

      "duplicate-column"
      (cond
        (and col in-src)
        (str "Duplicate column `" col "`" in-src
             " — declared more than once.")

        col
        (str "Duplicate column `" col "` — declared more than once.")

        :else
        "A column is declared more than once.")

      "syntax-error"
      (if detail
        (str "SQL syntax error: " detail ".")
        "SQL syntax error in the query body.")

      "validation-exception-error"
      (let [clean (sanitize-exception-message detail)]
        (cond
          (str/blank? clean) "The query raised an exception at validation time."
          :else              (str "Validation exception: " clean)))

      ;; Unknown type — be conservative, just show what we have.
      (cond
        (and error-type detail) (str error-type ": " detail)
        error-type              error-type
        detail                  detail
        :else                   "Analysis finding reported an error."))))

(defn- analysis-finding-error-reasons
  "Returns `entity-id → [{:flag :code :detail} …]` for broken-signal rows sourced from
  `analysis_finding_error`. Each error row contributes one reason whose detail is a
  humanised sentence (see `humanize-error-detail`).

  `entity-type-str` is the `analyzed_entity_type` value to filter on
  (`\"card\"`, `\"dashboard\"`, or `\"transform\"`).

  Source-name resolution order, from most authoritative to least:
    1. `source_entity_type` + `source_entity_id` — analyzer resolved to a
       Metabase row; we look up its display name.
    2. `source_entity_name` — analyzer saw a textual reference in the SQL
       (e.g. `schema.table`) but couldn't resolve it to an id (commonly the
       referenced warehouse table has been renamed/archived).
    3. None of the above — humaniser falls back to a generic \"couldn't
       attribute\" sentence."
  [entity-type-str entity-ids]
  (if-not (seq entity-ids)
    {}
    (let [rows         (t2/query
                        {:select [[:afe.analyzed_entity_id  :id]
                                  [:afe.error_type          :error_type]
                                  [:afe.error_detail        :error_detail]
                                  [:afe.source_entity_type  :source_entity_type]
                                  [:afe.source_entity_id    :source_entity_id]
                                  [:afe.source_entity_name  :source_entity_name]]
                         :from   [[:analysis_finding_error :afe]]
                         :where  [:and
                                  [:= :afe.analyzed_entity_type (h2x/literal entity-type-str)]
                                  [:in :afe.analyzed_entity_id (vec entity-ids)]]})
          source-pairs (into #{}
                             (keep (fn [{:keys [source_entity_type source_entity_id]}]
                                     (when (and source_entity_type source_entity_id)
                                       [source_entity_type source_entity_id])))
                             rows)
          source-name  (resolve-source-names source-pairs)]
      (reduce (fn [m {:keys [id error_type error_detail
                             source_entity_type source_entity_id source_entity_name]}]
                (let [resolved (when (and source_entity_type source_entity_id)
                                 (get source-name [source_entity_type source_entity_id]))
                      src      (or resolved source_entity_name)
                      ;; `:source_entity_type = "unknown"` is the
                      ;; multi-source signal from `enrich-error` — pair it
                      ;; with the comma-joined candidate list in
                      ;; `source_entity_name` so the UI says "in any of …".
                      multi?   (and (= source_entity_type "unknown")
                                    (seq source_entity_name))
                      detail   (humanize-error-detail error_type error_detail
                                                      src multi?)]
                  (update m id (fnil conj [])
                          {:flag   "broken"
                           :code   "analysis-finding-error"
                           :detail detail})))
              {} rows))))

(defn- format-last-used
  "Render a `last_used_at`-style timestamp as a yyyy-MM-dd string, or nil if missing.
  `value` may be a `java.time.OffsetDateTime` (from JDBC) or any java.time temporal
  Java time can derive a LocalDate from."
  [value]
  (when value
    (try
      (str (t/local-date value))
      (catch Throwable _ (str value)))))

(defn- not-used-detail
  "Human-readable detail for a card/dashboard stale reason."
  [last-used-at]
  (if-let [d (format-last-used last-used-at)]
    (str "Not used since " d ".")
    "Never used."))

(defn- attach-content-reasons
  "Decorate card or dashboard rows with `:reasons`. Fans out the `analysis_finding_error`
  query for broken rows; derives stale + unreferenced reasons in-process from the
  federated row's flag columns.

  `entity-type-str` selects between the card and dashboard wording for the unreferenced
  reason — the structural shape of the reason list is identical."
  [entity-type-str rows]
  (let [broken-ids   (mapv :id (filter #(pos? (or (:is_broken %) 0)) rows))
        broken-by-id (analysis-finding-error-reasons entity-type-str broken-ids)
        unref-detail (case entity-type-str
                       "card"      "Nothing in the dependency graph references this card."
                       "dashboard" "Nothing in the dependency graph references this dashboard."
                       "Nothing in the dependency graph references this entity.")]
    (mapv (fn [{:keys [id last_used_at is_stale is_broken is_unreferenced] :as row}]
            (let [reasons (cond-> []
                            (pos? (or is_broken 0))
                            (into (get broken-by-id id))

                            (pos? (or is_stale 0))
                            (conj {:flag   "stale"
                                   :code   "not-used-since"
                                   :detail (not-used-detail last_used_at)})

                            (pos? (or is_unreferenced 0))
                            (conj {:flag   "unreferenced"
                                   :code   "no-incoming-dependencies"
                                   :detail unref-detail}))]
              (assoc row :reasons reasons)))
          rows)))

;;; -------------------------------------- cards --------------------------------------

(defn cards-federated-query
  "Federated query for the Cards tab. Returns rows with the standard introspector shape plus
  `:is_stale`, `:is_broken`, `:is_unreferenced` flags.

  Options:
  - :conditions        — set of #{:stale :broken :unreferenced}; default all
  - :cutoff-date       — LocalDate for stale threshold; default 6 months ago
  - :collection-id     — optional collection scope (recursive)
  - :include-personal? — include personal collections (default false)
  - :search            — case-insensitive name substring
  - :sort-column       — :name | :last_used_at
  - :sort-direction    — :asc | :desc
  - :limit, :offset    — pagination"
  [{:keys [conditions cutoff-date collection-id include-personal? search
           sort-column sort-direction limit offset]
    :or   {conditions     #{:stale :broken :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [cutoff (or cutoff-date (t/minus (t/local-date) (t/months 6)))]
    (cond-> {:with [[:stale  (card-stale-cte cutoff)]
                    [:broken (broken-ids-cte "card")]
                    [:unref  (unreferenced-cards-cte)]]
             :select [:report_card.id
                      :report_card.name
                      :report_card.description
                      :report_card.collection_id
                      [:collection.name :collection_name]
                      :report_card.dashboard_id
                      :report_card.last_used_at
                      :report_card.display
                      :report_card.type
                      :report_card.archived
                      :report_card.creator_id
                      :report_card.created_at
                      :report_card.updated_at
                      [[:case [:not= :stale.id nil] 1 :else 0] :is_stale]
                      [[:case [:not= :broken.id nil] 1 :else 0] :is_broken]
                      [[:case [:not= :unref.id nil] 1 :else 0] :is_unreferenced]]
             :from   [:report_card]
             :left-join [[:stale :stale]   [:= :stale.id :report_card.id]
                         [:broken :broken] [:= :broken.id :report_card.id]
                         [:unref :unref]   [:= :unref.id :report_card.id]
                         ;; Pull the parent collection's name for display. LEFT JOIN
                         ;; so cards in the root (collection_id IS NULL) still come
                         ;; back — `:collection_name` is then nil and the FE shows
                         ;; "Our analytics" / similar root label.
                         [:collection :collection] [:= :collection.id :report_card.collection_id]]
             :where  [:and
                      [:= :report_card.archived false]
                      ;; Exclude cards living in an archived/trashed collection.
                      [:or
                       [:= :report_card.collection_id nil]
                       [:not-in :report_card.collection_id
                        {:select [:id]
                         :from   [:collection]
                         :where  [:= :collection.archived true]}]]
                      (conditions-filter-clause conditions)]
             :order-by (sort-clause :report_card.name sort-column sort-direction)
             :limit    limit
             :offset   offset}

      collection-id        (update :where conj [:= :report_card.collection_id collection-id])
      (not include-personal?) (update :where conj
                                      [:or
                                       [:= :report_card.collection_id nil]
                                       [:not-in :report_card.collection_id
                                        {:select [:id]
                                         :from   [:collection]
                                         :where  [:not= :personal_owner_id nil]}]])
      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :report_card.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn cards-total
  "Total Cards count for the same filter set (without pagination)."
  [opts]
  (-> (cards-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-cards
  "Run the federated Cards query and return `{:rows ... :total ...}`. Rows are decorated
  with `:reasons` so the UI can render per-flag explanations matching the Transforms tab."
  [opts]
  {:rows  (attach-content-reasons "card" (t2/query (cards-federated-query opts)))
   :total (-> (t2/query (cards-total opts)) first :total)})

;;; ------------------------------------ dashboards ------------------------------------

(defn dashboards-federated-query
  "Federated query for the Dashboards tab. Same shape as `cards-federated-query`, using
  `last_viewed_at` for the stale signal (aliased to `last_used_at` in the response)."
  [{:keys [conditions cutoff-date collection-id include-personal? search
           sort-column sort-direction limit offset]
    :or   {conditions     #{:stale :broken :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [cutoff (or cutoff-date (t/minus (t/local-date) (t/months 6)))]
    (cond-> {:with [[:stale  (dashboard-stale-cte cutoff)]
                    [:broken (broken-ids-cte "dashboard")]
                    [:unref  (unreferenced-dashboards-cte)]]
             :select [:report_dashboard.id
                      :report_dashboard.name
                      :report_dashboard.description
                      :report_dashboard.collection_id
                      [:collection.name :collection_name]
                      [:report_dashboard.last_viewed_at :last_used_at]
                      :report_dashboard.archived
                      :report_dashboard.creator_id
                      :report_dashboard.created_at
                      :report_dashboard.updated_at
                      [[:case [:not= :stale.id nil] 1 :else 0] :is_stale]
                      [[:case [:not= :broken.id nil] 1 :else 0] :is_broken]
                      [[:case [:not= :unref.id nil] 1 :else 0] :is_unreferenced]]
             :from   [:report_dashboard]
             :left-join [[:stale :stale]   [:= :stale.id :report_dashboard.id]
                         [:broken :broken] [:= :broken.id :report_dashboard.id]
                         [:unref :unref]   [:= :unref.id :report_dashboard.id]
                         ;; Same display-only join as cards-federated-query.
                         [:collection :collection] [:= :collection.id :report_dashboard.collection_id]]
             :where  [:and
                      [:= :report_dashboard.archived false]
                      ;; Exclude dashboards living in an archived/trashed collection.
                      [:or
                       [:= :report_dashboard.collection_id nil]
                       [:not-in :report_dashboard.collection_id
                        {:select [:id]
                         :from   [:collection]
                         :where  [:= :collection.archived true]}]]
                      (conditions-filter-clause conditions)]
             :order-by (sort-clause :report_dashboard.name sort-column sort-direction)
             :limit    limit
             :offset   offset}

      collection-id        (update :where conj [:= :report_dashboard.collection_id collection-id])
      (not include-personal?) (update :where conj
                                      [:or
                                       [:= :report_dashboard.collection_id nil]
                                       [:not-in :report_dashboard.collection_id
                                        {:select [:id]
                                         :from   [:collection]
                                         :where  [:not= :personal_owner_id nil]}]])
      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :report_dashboard.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn dashboards-total
  "Total Dashboards count for the same filter set."
  [opts]
  (-> (dashboards-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-dashboards
  "Run the federated Dashboards query and return `{:rows ... :total ...}`. Rows are decorated
  with `:reasons` so the UI can render per-flag explanations matching the Transforms tab."
  [opts]
  {:rows  (attach-content-reasons "dashboard" (t2/query (dashboards-federated-query opts)))
   :total (-> (t2/query (dashboards-total opts)) first :total)})

;;; ------------------------------------ transforms ------------------------------------
;;
;; Transforms don't have `last_used_at` or `last_viewed_at`. For v1 we surface :broken and
;; :unreferenced only — :stale for transforms is a separate design conversation (probably
;; based on `transform_run.last_run` or "enabled but never ran").

(defn transforms-federated-query
  "Federated query for the Transforms tab. Three independent signals now:

    - `:broken`       — analysis findings, latest run failed, or target table
                        missing **on a transform that has runs** (see
                        `broken-transforms-cte`).
    - `:stale`        — `:cutoff-date` based, time-flavored. A transform is
                        stale when it has no runs, no live target table, and
                        was created on or before the cutoff (see
                        `transform-stale-cte`).
    - `:unreferenced` — no inbound `dependency` edges (see
                        `unreferenced-transforms-cte`).

  Unlike the previous version which folded stale into unreferenced for
  transforms, these are now three distinct conditions, mirroring how
  Cards/Dashboards work."
  [{:keys [conditions cutoff-date search sort-column sort-direction limit offset]
    :or   {conditions     #{:broken :stale :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [cutoff (or cutoff-date (t/minus (t/local-date) (t/months 6)))]
    (cond-> {:with [[:broken (broken-transforms-cte)]
                    [:stale  (transform-stale-cte cutoff)]
                    [:unref  (unreferenced-transforms-cte)]]
             :select [:transform.id
                      :transform.name
                      :transform.description
                      :transform.source_database_id
                      :transform.target_table_id
                      :transform.creator_id
                      :transform.created_at
                      :transform.updated_at
                      ;; Raw JSON; parsed in `attach-transform-extras` to extract :type
                      ;; (query / native / python) for the "Target table" column.
                      [:transform.source :source_json]
                      ;; Cast all three because H2 infers union-of-CTE join columns
                      ;; as VARCHAR, which makes the CASE expression return strings
                      ;; ("1"/"0") instead of ints.
                      [[:cast [:case [:not= :stale.id nil] 1 :else 0] :integer] :is_stale]
                      [[:cast [:case [:not= :broken.id nil] 1 :else 0] :integer] :is_broken]
                      [[:cast [:case [:not= :unref.id nil] 1 :else 0] :integer] :is_unreferenced]]
             :from   [:transform]
             :left-join [[:broken :broken] [:= :broken.id :transform.id]
                         [:stale  :stale]  [:= :stale.id  :transform.id]
                         [:unref  :unref]  [:= :unref.id  :transform.id]]
             ;; Always filter out trashed transforms — they belong in the Trash
             ;; collection, not in the Introspector. Wrap in :and so the
             ;; trailing `(update :where conj search-clause)` keeps working.
             :where  [:and
                      [:= :transform.archived false]
                      (conditions-filter-clause conditions)]
             :order-by (case sort-column
                         :last_used_at [[:transform.updated_at (or sort-direction :desc)]]
                         [[:%lower.name (or sort-direction :asc)]])
             :limit    limit
             :offset   offset}

      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :transform.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn- transform-target-tables
  "Map of `transform-id → {:id ... :name ... :schema ... :db_id ... :db_name ... :active ...}`
  for the given transform ids. The db name lets the FE render the `db · type` subtitle in
  the Target-table column without a second roundtrip."
  [transform-ids]
  (when (seq transform-ids)
    (let [rows (t2/query
                {:select [[:t.id :transform_id]
                          [:mt.id :table_id]
                          [:mt.name :table_name]
                          [:mt.schema :schema]
                          [:mt.db_id :db_id]
                          [:mt.active :active]
                          [:db.name :db_name]]
                 :from   [[:transform :t]]
                 :join   [[:metabase_table :mt] [:= :mt.id :t.target_table_id]]
                 :left-join [[:metabase_database :db] [:= :db.id :mt.db_id]]
                 :where  [:and
                          [:in :t.id transform-ids]
                          [:not= :t.target_table_id nil]]})]
      (into {}
            (map (fn [r]
                   [(:transform_id r) {:id      (:table_id r)
                                       :name    (:table_name r)
                                       :schema  (:schema r)
                                       :db_id   (:db_id r)
                                       :db_name (:db_name r)
                                       :active  (:active r)}]))
            rows))))

(defn- transform-creators
  "Map of `transform-id → {:id ... :common_name ...}` for the given transform ids. Uses the
  same fallback logic as `metabase.users.models.user/common-name` (first + last, falling back
  to email when name parts are blank)."
  [transform-ids]
  (when (seq transform-ids)
    (let [rows (t2/query
                {:select [[:t.id :transform_id]
                          [:u.id :user_id]
                          [:u.first_name :first_name]
                          [:u.last_name :last_name]
                          [:u.email :email]]
                 :from   [[:transform :t]]
                 :left-join [[:core_user :u] [:= :u.id :t.creator_id]]
                 :where  [:in :t.id transform-ids]})
          common-name (fn [{:keys [first_name last_name email]}]
                        (let [name (str/trim (str (or first_name "") " " (or last_name "")))]
                          (if (str/blank? name) email name)))]
      (into {}
            (map (fn [r]
                   [(:transform_id r) (when (:user_id r)
                                        {:id          (:user_id r)
                                         :common_name (common-name r)})]))
            rows))))

(defn- transform-dependent-counts
  "Map of `transform-id → integer dependent count`. Counts `dependency` rows whose
  `(to_entity_type, to_entity_id)` points at either the transform itself or its
  `target_table_id`. Matches the spike's stale signal — a transform is stale iff this count
  is zero (and it isn't otherwise broken)."
  [transform-ids]
  (if-not (seq transform-ids)
    {}
    (let [rows (t2/query
                {:with [[:edges
                         {:union-all
                          [{:select [[:t.id :transform_id]]
                            :from   [[:transform :t]]
                            :join   [[:dependency :d]
                                     [:and
                                      [:= :d.to_entity_id :t.id]
                                      [:= :d.to_entity_type (h2x/literal "transform")]]]
                            :where  [:in :t.id transform-ids]}
                           {:select [[:t.id :transform_id]]
                            :from   [[:transform :t]]
                            :join   [[:dependency :d]
                                     [:and
                                      [:not= :t.target_table_id nil]
                                      [:= :d.to_entity_id :t.target_table_id]
                                      [:= :d.to_entity_type (h2x/literal "table")]]]
                            :where  [:in :t.id transform-ids]}]}]]
                 :select   [:transform_id [:%count.* :dep_count]]
                 :from     [:edges]
                 :group-by [:transform_id]})]
      (into {}
            (map (juxt :transform_id (comp long :dep_count)))
            rows))))

(defn- transform-latest-runs
  "Map of `transform-id → latest finished `transform_run` row` for the given transform ids.
  Only considers rows with `is_active IS NULL` (finished — succeeded, failed, canceled,
  timed-out)."
  [transform-ids]
  (when (seq transform-ids)
    (let [rows (t2/query
                {:with [[:finished_runs
                         {:select [:*
                                   [[:over [[:row_number]
                                            {:partition-by :transform_id
                                             :order-by     [[:start_time :desc]]}]]
                                    :rn]]
                          :from   [:transform_run]
                          :where  [:and
                                   [:in :transform_id transform-ids]
                                   [:= :is_active nil]]}]]
                 :select [:transform_id :status :start_time :end_time :message]
                 :from   [:finished_runs]
                 :where  [:= :rn [:inline 1]]})]
      (into {}
            (map (fn [r]
                   (let [^java.time.temporal.Temporal s (:start_time r)
                         ^java.time.temporal.Temporal e (:end_time r)
                         duration-ms (when (and s e)
                                       ;; Both H2 and Postgres return timestamps as Local- or
                                       ;; OffsetDateTime; compute against UTC instants to be
                                       ;; safe across both.
                                       (let [s* (cond
                                                  (instance? OffsetDateTime s) (.toInstant ^OffsetDateTime s)
                                                  (instance? LocalDateTime s)  (.toInstant ^LocalDateTime s ZoneOffset/UTC))
                                             e* (cond
                                                  (instance? OffsetDateTime e) (.toInstant ^OffsetDateTime e)
                                                  (instance? LocalDateTime e)  (.toInstant ^LocalDateTime e ZoneOffset/UTC))]
                                         (when (and s* e*)
                                           (.toMillis (Duration/between s* e*)))))]
                     [(:transform_id r) (-> r
                                            (dissoc :transform_id)
                                            ;; status is stored as a keyword by the model layer;
                                            ;; raw rows come back as strings — normalize.
                                            (update :status (fn [s] (cond-> s (keyword? s) name)))
                                            (assoc :duration_ms duration-ms))])))
            rows))))

(defn- transform-reasons
  "Returns `transform-id → [{:flag :code :detail} …]` for the given broken transform ids.

  Each broken signal contributes 0+ reasons:
  - analysis-finding errors: the message from `analysis_finding_error.message` (one per error
    row, deduplicated by error id).
  - target-table-missing: a single synthetic reason per affected transform.
  - latest-run-failed: a single reason with the run's `message` (truncated by the FE)."
  [transform-ids]
  (if-not (seq transform-ids)
    {}
    (let [ids                 (vec transform-ids)
          ;; Reuse the shared analysis-finding-error reader so cards, dashboards,
          ;; and transforms all hit the same SQL path.
          analysis-f          (future (analysis-finding-error-reasons "transform" ids))
          target-missing-f    (future
                                ;; Only report target-missing as a *reason* for
                                ;; rows where it actually contributes to broken,
                                ;; i.e. where the transform has runs.
                                (t2/query
                                 (-> (transform-target-missing-broken-cte)
                                     (update :where conj [:in :transform.id ids]))))
          latest-failed-f     (future
                                (t2/query
                                 {:with   [[:finished_runs
                                            {:select [:transform_id :status :message
                                                      [[:over [[:row_number]
                                                               {:partition-by :transform_id
                                                                :order-by     [[:start_time :desc]]}]]
                                                       :rn]]
                                             :from   [:transform_run]
                                             :where  [:and
                                                      [:in :transform_id ids]
                                                      [:= :is_active nil]]}]]
                                  :select [:transform_id :message]
                                  :from   [:finished_runs]
                                  :where  [:and
                                           [:= :rn [:inline 1]]
                                           [:= :status (h2x/literal "failed")]]}))
          analysis-reasons    @analysis-f
          target-missing-rows @target-missing-f
          latest-failed-rows  @latest-failed-f
          push                (fn [m id reason]
                                (update m id (fnil conj []) reason))]
      (as-> analysis-reasons reasons
        (reduce (fn [m {:keys [id]}]
                  (push m id
                        {:flag   "broken"
                         :code   "target-table-missing"
                         :detail "Target table is inactive or has been dropped."}))
                reasons target-missing-rows)
        (reduce (fn [m {:keys [transform_id message]}]
                  (let [clean (sanitize-exception-message message)]
                    (push m transform_id
                          {:flag   "broken"
                           :code   "latest-run-failed"
                           :detail (if (str/blank? clean)
                                     "The most recent run failed."
                                     (str "Most recent run failed: " clean))})))
                reasons latest-failed-rows)))))

(defn- parse-transform-type
  "Read the `:type` out of a transform.source JSON blob. Falls back to nil rather than
  throwing so a malformed row doesn't tank the whole page response."
  [source-json]
  (when (some? source-json)
    (try
      (-> source-json json/decode (get "type"))
      (catch Throwable _ nil))))

(defn- attach-transform-extras
  "Decorate transform rows with the spike's wire shape: `:target_table` (incl. db_name),
  `:last_run` (with `:duration_ms`), `:reasons`, `:creator`, `:dependent_count`,
  `:transform_type` (extracted from `transform.source`), `:flags` array (derived from the
  legacy `is_*` ints so the FE can match `docs/developers-guide/transforms-admin-cleanup-spike.md`
  without a wire-format break), and `:can_write`/`:can_delete` (constant true — the endpoint
  is superuser-only, so per-row perm checks add latency for no signal in v1)."
  [rows]
  (let [ids         (mapv :id rows)
        broken-ids  (mapv :id (filter #(pos? (:is_broken %)) rows))
        ;; 5 independent reads against the app DB — fan out so wall time is
        ;; max(...) instead of sum(...). transform-reasons itself fans out
        ;; another 3 internally.
        tables-f     (future (transform-target-tables ids))
        latest-f     (future (transform-latest-runs ids))
        reasons-f    (future (transform-reasons broken-ids))
        creators-f   (future (transform-creators ids))
        dep-counts-f (future (transform-dependent-counts ids))
        tables       @tables-f
        latest       @latest-f
        reasons      @reasons-f
        creators     @creators-f
        dep-counts   @dep-counts-f]
    (mapv (fn [{:keys [id is_broken is_stale is_unreferenced source_json] :as row}]
            (let [flags (cond-> []
                          (pos? (or is_broken 0))       (conj "broken")
                          ;; For transforms the spike folds "no dependents" into the Stale
                          ;; bucket; introspector tracks the same signal as `is_unreferenced`.
                          (pos? (or is_unreferenced 0)) (conj "stale")
                          (pos? (or is_stale 0))        (conj "stale"))]
              (-> row
                  (dissoc :source_json)
                  (assoc :target_table    (get tables id))
                  (assoc :last_run        (get latest id))
                  (assoc :reasons         (get reasons id []))
                  (assoc :creator         (get creators id))
                  (assoc :dependent_count (get dep-counts id 0))
                  (assoc :transform_type  (parse-transform-type source_json))
                  (assoc :flags           (distinct flags))
                  (assoc :can_write       true)
                  (assoc :can_delete      true))))
          rows)))

(defn transforms-total
  "Total Transforms count for the same filter set."
  [opts]
  (-> (transforms-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-transforms
  "Run the federated Transforms query and return `{:rows ... :total ...}`. Rows are
  decorated with `:target_table`, `:last_run`, and `:reasons` so the UI can render the
  spike's row shape (see `docs/developers-guide/transforms-admin-cleanup-spike.md`)."
  [opts]
  {:rows  (attach-transform-extras (t2/query (transforms-federated-query opts)))
   :total (-> (t2/query (transforms-total opts)) first :total)})

;;; -------------------------------------- summary --------------------------------------

(def ^:private archived-collection-ids-subq
  "Subquery selecting ids of all archived (trashed) collections."
  {:select [:id] :from [:collection] :where [:= :collection.archived true]})

(defn- cards-summary-query
  "Single aggregated query returning broken/stale/unreferenced/healthy counts.
   COUNT() of each CTE join column counts non-null matches; COUNT(*) gives the
   total of all unarchived/visible rows (the existing `:healthy` semantics).
   Replaces 4 sequential round-trips per entity type."
  [cutoff]
  {:with [[:stale  (card-stale-cte cutoff)]
          [:broken (broken-ids-cte "card")]
          [:unref  (unreferenced-cards-cte)]]
   :select    [[[:count :broken.id] :broken]
               [[:count :stale.id]  :stale]
               [[:count :unref.id]  :unreferenced]
               [:%count.*           :healthy]]
   :from      [:report_card]
   :left-join [[:stale :stale]   [:= :stale.id :report_card.id]
               [:broken :broken] [:= :broken.id :report_card.id]
               [:unref :unref]   [:= :unref.id :report_card.id]]
   :where     [:and
               [:= :report_card.archived false]
               [:or
                [:= :report_card.collection_id nil]
                [:not-in :report_card.collection_id archived-collection-ids-subq]]]})

(defn- dashboards-summary-query [cutoff]
  {:with [[:stale  (dashboard-stale-cte cutoff)]
          [:broken (broken-ids-cte "dashboard")]
          [:unref  (unreferenced-dashboards-cte)]]
   :select    [[[:count :broken.id] :broken]
               [[:count :stale.id]  :stale]
               [[:count :unref.id]  :unreferenced]
               [:%count.*           :healthy]]
   :from      [:report_dashboard]
   :left-join [[:stale :stale]   [:= :stale.id :report_dashboard.id]
               [:broken :broken] [:= :broken.id :report_dashboard.id]
               [:unref :unref]   [:= :unref.id :report_dashboard.id]]
   :where     [:and
               [:= :report_dashboard.archived false]
               [:or
                [:= :report_dashboard.collection_id nil]
                [:not-in :report_dashboard.collection_id archived-collection-ids-subq]]]})

(defn- transforms-summary-query [cutoff]
  {:with [[:broken (broken-transforms-cte)]
          [:stale  (transform-stale-cte cutoff)]
          [:unref  (unreferenced-transforms-cte)]]
   :select    [[[:count :broken.id] :broken]
               [[:count :stale.id]  :stale]
               [[:count :unref.id]  :unreferenced]
               [:%count.*           :healthy]]
   :from      [:transform]
   :left-join [[:broken :broken] [:= :broken.id :transform.id]
               [:stale  :stale]  [:= :stale.id  :transform.id]
               [:unref  :unref]  [:= :unref.id  :transform.id]]
   :where     [:= :transform.archived false]})

(defn summary
  "Per-entity-type, per-condition counts for the stat strip. `:cutoff-date`
  (LocalDate) is the staleness threshold for cards/dashboards; defaults to
  6 months ago when not supplied. The user-chosen value flows through here so
  the StatStrip totals agree with the row list (otherwise you'd see, say,
  '8758 stale' in the strip while the table — filtered with a different
  cutoff — shows a different subset)."
  [& {:keys [cutoff-date]}]
  (let [cutoff       (or cutoff-date (t/minus (t/local-date) (t/months 6)))
        cards-f      (future (first (t2/query (cards-summary-query cutoff))))
        dashboards-f (future (first (t2/query (dashboards-summary-query cutoff))))
        ;; Transforms use a different stale signal (target-missing + no-runs +
        ;; created-before-cutoff) — see `transform-stale-cte`. Still keyed on
        ;; the same cutoff so all three entity types respond to the same FE
        ;; staleness picker.
        transforms-f (future (first (t2/query (transforms-summary-query cutoff))))
        cards        @cards-f
        dashboards   @dashboards-f
        transforms   @transforms-f]
    {:cards      cards
     :dashboards dashboards
     :transforms {:broken       (or (:broken transforms) 0)
                  :stale        (or (:stale transforms) 0)
                  :unreferenced (or (:unreferenced transforms) 0)
                  :healthy      (or (:healthy transforms) 0)}}))

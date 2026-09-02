(ns metabase.osi.models.osi-ai-context
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity identified by `entity_type`/`entity_local_id`.

  Identity is the logical `(entity_type, entity_local_id)` pair — that compound key is the primary key, so
  there is one row per entity and no surrogate id or serialization NanoID.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Every write nudges that index (see the hooks below), so no writer has to remember to; the periodic full
  reconcile is the backstop, and a missed nudge costs freshness until it runs, never correctness."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(methodical/defmethod t2/table-name :model/OsiAiContext [_model] :osi_ai_context)

(doto :model/OsiAiContext
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; The logical (entity_type, entity_local_id) pair is the primary key — no surrogate id.
(methodical/defmethod t2/primary-keys :model/OsiAiContext [_model] [:entity_type :entity_local_id])

;; Toucan's generic transformed-model `insert.pks` result handler mishandles this model's compound,
;; non-integer key (it isn't a single auto-increment id), so a plain insert fails with "Key must be
;; integer". Neither primary-key column has an output transform, so returning the JDBC layer's raw
;; `[entity_type id]` pair unchanged is correct here.
(methodical/defmethod t2.pipeline/results-transform [:toucan.query-type/insert.pks :model/OsiAiContext]
  [_query-type _model]
  identity)

(defn ->ai-context
  "Coerce the OSI `ai_context` oneOf into the object form we store.

    \"count new signups\"  =>  {:instructions \"count new signups\"}   ; string shorthand
    {:synonyms [...]}     =>  {:synonyms [...]}                    ; already an object
    nil                   =>  nil

  Runs ahead of [[mi/json-in]], which would otherwise store the string verbatim as pre-serialized JSON."
  [ai-context]
  (if (string? ai-context) {:instructions ai-context} ai-context))

(def AiContext
  "Closed OSI ai_context schema for API and generated writes; its limits come from
  [[entity-retrieval/AiContext]]."
  entity-retrieval/AiContext)

(def ^:private StoredAiContext
  "Forward-compatible storage schema: known fields retain the write limits, while unknown keys from a newer
  Metabase export survive import and re-export. API and generated writes validate the closed [[AiContext]]
  before they reach this boundary."
  [:map {:closed false}
   [:instructions {:optional true} [:maybe [:string {:max entity-retrieval/max-instructions-len}]]]
   [:synonyms     {:optional true} [:sequential {:max entity-retrieval/max-list-len}
                                    [:string {:max entity-retrieval/max-item-len}]]]
   [:examples     {:optional true} [:sequential {:max entity-retrieval/max-list-len}
                                    [:string {:max entity-retrieval/max-item-len}]]]])

(defn- validate-ai-context!
  [row]
  (when (contains? row :ai_context)
    (mu/validate-throw StoredAiContext (->ai-context (:ai_context row))))
  row)

(def data-sources
  "Permitted values of `data_source`.
  The value describes the content currently stored in the row, not an intent:
  - `:human` means a person approved the current content, not that a person authored it. An admin editing a
    generated blob through the CRUD API approves it.
  - `:metabot` means generation wrote the current content.

  Only a content write moves the value. The generation job sets it to `:metabot` when it rewrites the
  content, never when a rewrite is merely requested.
  The job leaves a `:human` row alone unless `rewrite_requested_at` is later than `generated_at`, which is
  an admin asking for the rewrite explicitly."
  #{:human :metabot})

(def DataSource
  "Malli schema for `data_source` — strict, for writes.
  Reads are deliberately lenient (see the CRUD API's `Entry`) so one row written by a newer node cannot fail
  response validation for a whole list during a rolling deploy."
  (into [:enum] (sort data-sources)))

(defn- validate-data-source!
  "Reject unknown approval states at the model boundary, including direct Toucan and serdes writes."
  [row]
  (when (contains? row :data_source)
    (let [data-source (some-> (:data_source row) keyword)]
      (when-not (contains? data-sources data-source)
        (throw (ex-info (str "data_source must be one of: " (str/join ", " (sort (map name data-sources))))
                        {:status-code 400 :data_source (:data_source row)})))))
  row)

(def api-columns
  "Columns the CRUD API selects — every column except `basis`.
  `basis` is stored in a text column with no size cap and has no reader outside the generation job, so it
  never rides a read response."
  [:entity_type :entity_local_id :ai_context :data_source
   :generated_at :invalidated_at :basis_invalidated_at :rewrite_requested_at :generator_version
   :created_at :updated_at])

(defn- nudge-index!
  "Ask the enterprise index to reconcile this entity's slice once the surrounding transaction commits.
  Outside a transaction the thunk runs immediately. Fire-and-forget: no-op without the feature, never
  throws, and does no embedding or pgvector work on this thread."
  [entity-type entity-local-id]
  (app-db/do-after-commit #(mirror/request-entity-sync! entity-type entity-local-id)))

(t2/deftransforms :model/OsiAiContext
  ;; ai_context is keywordized on read so reconcile reads (:instructions ai_context) etc. directly. On write
  ;; the string shorthand is migrated to {:instructions s}, so storage is always the object form and every
  ;; write path (CRUD API, serdes import, direct appdb write) is normalized at this one boundary.
  {:ai_context  {:in  (comp mi/json-in ->ai-context)
                 :out mi/json-out-with-keywordization}
   :data_source mi/transform-keyword
   ;; basis is keywordized on read so the generation job compares a stored basis with a freshly built one by
   ;; value. That comparison is the diff that gates every LLM call, so a basis that does not survive a JSON
   ;; round-trip `=`-unchanged reports a phantom change — and an LLM bill — on every run.
   :basis       {:in  mi/json-in
                 :out mi/json-out-with-keywordization}})

;;; Card-backed entities (question/metric/model) store their `entity_type` as the canonical `card`, so one
;;; ai_context row survives a type relabel and keys on a stable `(card, entity_local_id)`. The CRUD and tool
;;; APIs still speak the real types; only the stored key is normalized. Non-card types pass through.
(t2/define-before-insert :model/OsiAiContext
  [row]
  (cond-> (-> row validate-data-source! validate-ai-context!)
    (:entity_type row) (update :entity_type entity-retrieval/normalize-entity-type)))

(t2/define-before-update :model/OsiAiContext
  [row]
  (-> (t2/changes row) validate-data-source! validate-ai-context!)
  row)

(def ^:private ^:dynamic *update-changes*
  "The columns an in-flight update is setting, published by the pipeline method below for the
  after-update hook. Nil outside an update."
  nil)

;; The nudge cannot be issued from `before-update`: Toucan runs that hook *before* opening its own
;; transaction, so outside a caller transaction `do-after-commit` fires the thunk immediately and the
;; reconcile reads the row as it was before the UPDATE. `after-update` runs inside that transaction, but
;; `t2/changes` there is a lazy row whose `contains?` answers for columns rather than changes — it would
;; report every column as changed. So the changes map is published here, where it is accurate, and read
;; from the hook, which has both the committed timing and the affected row.
(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/update.* #_model :model/OsiAiContext #_resolved-query :default]
  [rf query-type model {:keys [changes] :as parsed-args} resolved-query]
  (binding [*update-changes* changes]
    (next-method rf query-type model parsed-args resolved-query)))

(t2/define-after-update :model/OsiAiContext
  [row]
  ;; `ai_context` is the only column an index doc is derived from, so a write that touches just the
  ;; generation metadata (a regenerate request, a basis stamp) has nothing to reconcile. In steady state
  ;; that is most of what the generation job writes, and every skipped nudge is an exclusive index lock
  ;; not taken — one that would make concurrent library searches return nothing while it was held.
  (when (contains? *update-changes* :ai_context)
    (nudge-index! (:entity_type row) (:entity_local_id row)))
  row)

;;; Every write nudges the targeted index reconcile, rather than leaving each writer to remember. Serdes
;;; import is the case that proves the point: it writes through Toucan like anything else and has nowhere
;;; obvious to call a nudge from, so without a hook an imported synonym stayed unsearchable until the next
;;; full reconcile.
;;;
;;; A burst costs one drain rather than N runs: `request-entity-sync!` only adds to a dirty set, and the
;;; enterprise scheduler keeps at most one pending run.
;;; The drain still reconciles each dirty entity separately, so an import touching N entities performs N
;;; entity reconciles in one pass. Both paths embed exactly the documents whose `doc_id` is not already
;;; stored, so batching would not change how much text is embedded — only how many provider requests it is
;;; split across. (`doc_id` covers the entity and doc type as well as the text, so it dedupes an unchanged
;;; document, not the same text appearing on two entities.)
;;;
;;; Updates nudge only when `ai_context` changed — it is the one column an index doc is derived from. The
;;; pipeline method below publishes the changes map and the after-update hook reads it; see the comment
;;; there for why neither the before-update hook nor `t2/changes` can answer that question.
(t2/define-after-insert :model/OsiAiContext
  [row]
  (nudge-index! (:entity_type row) (:entity_local_id row))
  row)

;; before-delete, since Toucan has no after-delete. Safe here, unlike the update path: Toucan opens its
;; transaction *before* running before-delete hooks, so the nudge defers to commit and never fires for a
;; delete that rolls back.
(t2/define-before-delete :model/OsiAiContext
  [row]
  (nudge-index! (:entity_type row) (:entity_local_id row))
  row)

;;; ------------------------------------------------- Serialization -------------------------------------------------
;;;
;;; A row's identity is its entity ref: `entity_type` plus the entity it describes. Rather than a separate
;;; NanoID, serdes nests the row under its entity's portable path (mirroring
;;; [[metabase.warehouse-schema.models.field-user-settings]], which hangs off its Field): the path is the
;;; entity's path plus a constant `OsiAiContext` segment. So both key columns are carried by the path —
;;; `entity_local_id` is resolved from it on import, and `entity_type` is read back from the parent segment.

(def ^:private entity-type->toucan
  "Toucan model each `entity_type` resolves to. Tables get the table-fk treatment instead.
  The card flavors (the type mirrors the agent's `read_resource` resource type) all map to Card."
  {"card"     :model/Card
   "model"    :model/Card
   "metric"   :model/Card
   "question" :model/Card
   "measure"  :model/Measure
   "segment"  :model/Segment})

(def ^:private parent-model->entity-type
  "Inverse of the parent's serdes model name back to the stored `entity_type`."
  {"Table"   "table"
   "Card"    "card"
   "Measure" "measure"
   "Segment" "segment"})

(defn- entity-parent-path
  "Portable serdes path of the entity a row describes — the path its `OsiAiContext` segment hangs under.
  A Table expands to its `[Database Schema Table]` path; card/measure/segment refs are a single segment
  keyed on the entity's `entity_id`. An unmapped type yields a raw-id segment rather than aborting export."
  [entity-type entity-local-id]
  (cond
    (= entity-type "table")           (serdes/table->path (serdes/*export-table-fk* entity-local-id))
    (entity-type->toucan entity-type) (let [model (entity-type->toucan entity-type)]
                                        [{:model (name model) :id (serdes/*export-fk* entity-local-id model)}])
    :else                             [{:model entity-type :id entity-local-id}]))

(defn- parent-path->entity
  "Inverse of [[entity-parent-path]]: resolve a parent path back to `{:entity_type :entity_local_id}` (the
  local id), or `nil` when the referenced entity is absent."
  [parent-path]
  (let [{:keys [model id]} (last parent-path)]
    (if (= model "Table")
      {:entity_type "table"
       :entity_local_id (serdes/*import-table-fk* (mapv :id parent-path))}
      (when-let [etype (parent-model->entity-type model)]
        (when-let [toucan (entity-type->toucan etype)]
          {:entity_type etype :entity_local_id (serdes/*import-fk* id toucan)})))))

(defmethod serdes/entity-id "OsiAiContext" [_ _] nil)

(defmethod serdes/generate-path "OsiAiContext" [_ {:keys [entity_type entity_local_id]}]
  (conj (vec (entity-parent-path entity_type entity_local_id))
        {:model "OsiAiContext" :id "ai_context"}))

(defmethod serdes/storage-path "OsiAiContext" [entity _ctx]
  ;; Store under a flat top-level directory rather than nesting next to the entity: serdes/storage-path-prefixes
  ;; only knows how to nest under Database/Schema/Table/Field, so a Card/Measure/Segment parent would throw.
  ;; The row's identity still lives in its nested generate-path (the on-disk :serdes/meta); this is only the
  ;; file's location. Storage dedups by `:key`, so it must be unambiguous: use the EDN of the parent's
  ;; `[model id]` pairs (ids can contain "/" and ":", so a delimiter-joined string could collide for distinct
  ;; paths). The slug is just a readable filename — the unique-name generator disambiguates it by `:key`.
  (let [parent (pop (vec (serdes/path entity)))]
    [{:label "osi_ai_context"}
     {:label (u/slugify (str/join "-" (map :id parent)) {:unicode? true})
      :key   (pr-str (mapv (juxt :model :id) parent))}]))

;; `ai_context` is a plain text blob (no FKs — instructions/synonyms/examples are free text), so it copies
;; verbatim. `data_source` copies with it: whether the content was approved by a person is a property of the
;; content, and an export that dropped it would land every curated blob on a target instance as machine-owned
;; and eligible for overwrite. The key columns are carried by the path, not as fields: `entity_local_id` is
;; resolved from the parent path on import, and `entity_type` is read back from the parent segment's model.
(defmethod serdes/make-spec "OsiAiContext" [_model-name _opts]
  {:copy      [:ai_context]
   ;; Generation state is local: it describes this instance's generation run against this instance's
   ;; entities, and the target instance's entities have their own histories. An imported row carries no
   ;; `basis`, so a new row is a forced candidate on the target. Updating an existing row explicitly clears
   ;; stale generation claims below when the imported content differs.
   :skip      [:generated_at :invalidated_at :basis_invalidated_at :basis :rewrite_requested_at
               :generator_version]
   :transform {:created_at      (serdes/date)
               :updated_at      (serdes/date)
               :data_source     {:export name
                                 ;; Every pre-metadata export was curated through the CRUD API, so absence
                                 ;; means human-approved on both insert and update. Preserving a target's
                                 ;; local :metabot flag would make identical imported content overwritable.
                                 :import (fn [v] (if v (keyword v) :human))}
               :entity_type     {:export (constantly ::serdes/skip)
                                 :import-with-context
                                 (fn [current _ _] (:entity_type (parent-path->entity (pop (serdes/path current)))))}
               :entity_local_id {::serdes/fk true
                                 :export     (constantly ::serdes/skip)
                                 :import-with-context
                                 (fn [current _ _] (:entity_local_id (parent-path->entity (pop (serdes/path current)))))}}})

(defmethod serdes/deserialization-dependencies "OsiAiContext"
  [entity]
  ;; Depend on the entity this row describes (its parent path), so it imports after that entity exists.
  [(vec (pop (serdes/path entity)))])

(defmethod serdes/load-find-local "OsiAiContext"
  [path]
  ;; Resolve the parent path back to a local entity, then find this row by its (entity_type, local-id) key.
  (when-let [{:keys [entity_type entity_local_id]} (parent-path->entity (pop path))]
    (t2/select-one :model/OsiAiContext
                   :entity_type (entity-retrieval/normalize-entity-type entity_type)
                   :entity_local_id entity_local_id)))

(defmethod serdes/load-update! "OsiAiContext"
  [_model-name ingested local]
  ;; The default keys updates on (first (primary-keys)), which for this compound key is just :entity_type —
  ;; so it would address the wrong rows. Update by the full (entity_type, entity_local_id) key.
  (let [content-changed? (and (contains? ingested :ai_context)
                              (not= (->ai-context (:ai_context ingested)) (:ai_context local)))
        ingested         (cond-> ingested
                           ;; Imported content has no valid claim to this instance's generation basis,
                           ;; version, or timestamps. Clear those claims atomically with the content so the
                           ;; next sweep cannot mistake a stale local basis for convergence.
                           content-changed? (assoc :generated_at nil
                                                   :basis_invalidated_at nil
                                                   :basis nil
                                                   :rewrite_requested_at nil
                                                   :generator_version nil))]
    (t2/update! :model/OsiAiContext
                :entity_type (:entity_type local) :entity_local_id (:entity_local_id local)
                ingested))
  (t2/select-one :model/OsiAiContext
                 :entity_type (:entity_type local) :entity_local_id (:entity_local_id local)))

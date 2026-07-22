(ns metabase-enterprise.remote-sync.worktree-identity
  "Entity-id identity transform for non-default worktrees.

   Serdes matches rows by entity_id and upserts in place, so importing a branch alongside the default
   worktree would overwrite the default worktree's rows instead of materializing copies. Non-default
   pulls therefore load every entity under a *worktree-local* entity id: `<worktree-id>/<entity-id>`,
   with `/` as a separator that cannot appear in the NanoID alphabet. The canonical (git) identity is
   parseable from the local id — no derivation, no persisted mapping, no collision risk — and pushes
   just strip the prefix, so the YAML written to git always carries canonical ids and an unedited
   checkout exports byte-identical to what was imported.

   Entities *created inside* a worktree get an ordinary bare NanoID: their local id *is* canonical,
   which is how a branch-born entity keeps its id when the branch merges into the default worktree.

   Everything here is pure data transformation; wiring it into the pull and push flows happens where
   those flows are scoped per worktree."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

(mr/def ::worktree-id pos-int?)

(mu/defn local-entity-id :- :string
  "The worktree-local entity id for `canonical-eid` in worktree `worktree-id`: `<worktree-id>/<eid>`."
  [worktree-id   :- ::worktree-id
   canonical-eid :- :string]
  (str worktree-id "/" canonical-eid))

(mu/defn canonical-entity-id :- [:maybe :string]
  "The canonical (git) entity id for `eid`: strips a `<worktree-id>/` prefix when present, otherwise
   returns `eid` unchanged (bare ids are canonical already)."
  [eid :- [:maybe :string]]
  (some-> eid (str/replace #"^\d+/" "")))

(mu/defn identity-map :- [:map-of :string :string]
  "Map of canonical entity id → worktree-local entity id for every id in `canonical-eids`."
  [worktree-id    :- ::worktree-id
   canonical-eids :- [:sequential :string]]
  (into {} (map (juxt identity #(local-entity-id worktree-id %))) canonical-eids))

;;; ------------------------------------------------ Rewriting -------------------------------------------------------

(defn- rewrite-strings
  "Walk `form` — including map keys, since entity ids appear in JSON-encoded key positions like
   column_settings and visualizer mappings — applying `f` to every string."
  [form f]
  (walk/postwalk #(if (string? %) (f %) %) form))

(def ^:private entity-id-pattern
  "Matches any NanoID-shaped run of characters; the replacement decides whether it is a known id."
  #"[A-Za-z0-9_-]{21}")

(defn localize-entity-ids
  "Walk `form`, rewriting every occurrence of `canonical->local`'s keys inside string values — both
   whole-string ids (`:entity_id`, FK refs) and ids embedded in larger strings (`\"card__<eid>\"`
   source-table refs, visualizer `\"card:<eid>\"` keys, JSON-encoded column_settings keys). Ids not in
   the mapping — references to entities outside the checkout — pass through untouched, which is what
   makes refs to unsynced or default-worktree content resolve against the canonical rows."
  [form canonical->local]
  (if (empty? canonical->local)
    form
    (rewrite-strings form #(str/replace % entity-id-pattern (fn [m] (get canonical->local m m))))))

(mu/defn canonicalize-entity-ids
  "Walk `form`, stripping worktree `worktree-id`'s prefix from every embedded local entity id — the
   inverse of [[localize-entity-ids]] for content materialized by that worktree. Applied on push so the
   YAML written to git carries only canonical ids. Needs no mapping: the prefix is unambiguous."
  [form
   worktree-id :- ::worktree-id]
  (let [pattern (re-pattern (str (Pattern/quote (str worktree-id "/"))
                                 "(?=[A-Za-z0-9_-]{21}(?:[^A-Za-z0-9_-]|$))"))]
    (rewrite-strings form #(str/replace % pattern ""))))

;;; ------------------------------------------- Ingestion wrapping ---------------------------------------------------

(mu/defn snapshot-canonical-ids :- [:sequential :string]
  "All canonical entity ids present in `ingestable`'s entity listing. Path-identity entries (Tables,
   Fields, Settings — whose path ids are names, not NanoIDs) are skipped."
  [ingestable]
  (into []
        (comp (mapcat identity)
              (keep :id)
              (filter serdes/entity-id?)
              (distinct))
        (serialization/ingest-list ingestable)))

(mu/defn wrap-ingestable
  "Wrap `ingestable` so every entity ingests under worktree `worktree-id`'s local entity ids. Listing
   paths, entity payloads, and all embedded references into the checkout are localized; refs to
   entities outside the checkout keep their canonical ids and resolve against existing rows."
  [ingestable
   worktree-id :- ::worktree-id]
  (let [canonical->local (identity-map worktree-id (snapshot-canonical-ids ingestable))]
    (reify serialization/Ingestable
      (ingest-list [_]
        (eduction (map #(localize-entity-ids % canonical->local))
                  (serialization/ingest-list ingestable)))
      (ingest-one [_ path]
        (-> (serialization/ingest-one ingestable (canonicalize-entity-ids path worktree-id))
            (localize-entity-ids canonical->local)))
      (ingest-errors [_]
        (serialization/ingest-errors ingestable)))))

(ns metabase.metabot.quality.governance
  "Resolve canonical-rank for the entity refs harvested by `quality.extract`.

  Three of the eleven BOT-1515 signals (`canonical-bypass`, `canonical-ignored`,
  `search-ignored`) need to know whether a referenced entity carries a
  governance marker — a verified moderation review or an official collection
  for cards; `data_layer = 'final'` or `data_authority = 'authoritative'` for
  tables. The signal predicates do not run the lookup themselves; instead they
  consult a single `{[ref-type ref-id] → :canonical | :non-canonical | :unknown}`
  map produced once per scoring call by `resolve-canonical-rank`.

  Two batched HoneySQL queries cover the classifiable cases: one against
  `report_card` (with the moderation_review / collection join) and one against
  `metabase_table`. Refs whose type is not classified in v1.0.0 (dashboards,
  databases, transforms) always resolve to `:unknown`, as do ids missing from
  the appdb (deleted or never-existed).

  Cross-reference:
    - signal panel: notes/bot-1515-conversation-score/strategy-v3-signals-ref-v2.md §2.4, §3.1–§3.3
    - design: notes/bot-1515-conversation-score/impl-phase-1-conversation-composites.md §4.4"
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Ref-type partitions
;; ---------------------------------------------------------------------------

(def ^:private card-ref-types
  "Ref types resolved via `report_card`. The four share the same canonical-rank
  rule (verified moderation review on `most_recent=true` OR official
  collection); the subtype (question/model/metric) is irrelevant to the verdict
  itself and lives on the `report_card.type` column for callers who need it."
  #{:card :question :model :metric})

(def ^:private table-ref-types
  "Ref types resolved via `metabase_table`."
  #{:table})

;; Dashboards, databases, and transforms are intentionally absent. v1.0.0 does
;; not classify them — see strategy-v3 §3.1 footnote. They resolve to :unknown
;; without a DB lookup.

;; ---------------------------------------------------------------------------
;; Batched lookups
;; ---------------------------------------------------------------------------

(defn- card-rank-rows
  "Run the cards batched query for `card-ids`. Returns rows of
  `{:id :authority_level :moderation_status}` (the latter two may be nil)."
  [card-ids]
  (t2/query {:select    [[:c.id :id]
                         [:coll.authority_level :authority_level]
                         [:mr.status :moderation_status]]
             :from      [[:report_card :c]]
             :left-join [[:collection :coll]
                         [:= :coll.id :c.collection_id]
                         [:moderation_review :mr]
                         [:and
                          [:= :mr.moderated_item_id :c.id]
                          [:= :mr.moderated_item_type [:inline "card"]]
                          [:= :mr.most_recent true]]]
             :where     [:in :c.id (vec card-ids)]}))

(defn- card-ranks
  "Resolve canonical-rank for card-typed ref ids. Returns `{id → :canonical | :non-canonical}`
  for every id present in `report_card`; ids missing from the table are absent
  from the result and surface as `:unknown` upstream."
  [card-ids]
  (when (seq card-ids)
    (into {}
          (map (fn [{:keys [id authority_level moderation_status]}]
                 [id
                  (if (or (= moderation_status "verified")
                          (= authority_level "official"))
                    :canonical
                    :non-canonical)]))
          (card-rank-rows card-ids))))

(defn- table-rank-rows
  "Run the tables batched query for `table-ids`. Returns rows of
  `{:id :data_layer :data_authority}`."
  [table-ids]
  (t2/query {:select [:id :data_layer :data_authority]
             :from   [[:metabase_table]]
             :where  [:in :id (vec table-ids)]}))

(defn- table-ranks
  "Resolve canonical-rank for table ref ids. Returns `{id → :canonical | :non-canonical}`
  for every id present in `metabase_table`."
  [table-ids]
  (when (seq table-ids)
    (into {}
          (map (fn [{:keys [id data_layer data_authority]}]
                 [id
                  (if (or (= data_layer "final")
                          (= data_authority "authoritative"))
                    :canonical
                    :non-canonical)]))
          (table-rank-rows table-ids))))

;; ---------------------------------------------------------------------------
;; Public API
;; ---------------------------------------------------------------------------

(defn- normalize-pair
  "Coerce a single input element into `[ref-type ref-id]` or nil if the shape
  is malformed. Accepts either a `[type id]` vector or a map carrying
  `:ref-type` / `:ref-id` so callers can pass the refs harvested by
  `quality.extract` directly."
  [x]
  (cond
    (map? x)
    (let [t (:ref-type x)
          i (:ref-id x)]
      (when (and (keyword? t) (some? i))
        [t i]))

    (and (vector? x) (= 2 (count x)))
    (let [[t i] x]
      (when (and (keyword? t) (some? i))
        [t i]))

    :else nil))

(defn resolve-canonical-rank
  "Given a seq of `[ref-type ref-id]` pairs (or ref-maps with `:ref-type` /
  `:ref-id`), return `{[ref-type ref-id] → :canonical | :non-canonical | :unknown}`.

  Verdicts:
    `:canonical`     — the entity carries a governance marker (verified for cards,
                       final/authoritative for tables).
    `:non-canonical` — the entity exists in the appdb but lacks a marker.
    `:unknown`       — the entity could not be classified: it is missing from
                       the appdb, the ref-type is not classified in v1.0.0
                       (`:dashboard`, `:database`, `:transform`), or the ref
                       shape was malformed.

  Issues at most one SELECT per ref-type kind that has at least one ref."
  [refs]
  (let [pairs       (into #{} (keep normalize-pair) refs)
        ids-of      (fn [type-set]
                      (into #{}
                            (comp (filter #(type-set (first %)))
                                  (map second))
                            pairs))
        card-rank-map  (card-ranks  (ids-of card-ref-types))
        table-rank-map (table-ranks (ids-of table-ref-types))]
    (into {}
          (map (fn [[ref-type ref-id :as pair]]
                 [pair
                  (cond
                    (card-ref-types  ref-type) (get card-rank-map  ref-id :unknown)
                    (table-ref-types ref-type) (get table-rank-map ref-id :unknown)
                    :else                      :unknown)]))
          pairs)))

(ns metabase.metabot.quality.governance
  "Batched governance lookup plus the canonical-entity predicate.

  [[resolve]] returns `{[type id-str] facts}` for the entity-refs that
  appear across a conversation's sets. Cards and tables carry the inputs
  [[canonical?]] reads; dashboards, databases, and transforms carry only a
  display name. An entity the appdb can't find is absent from the map, so
  callers must tolerate a missing key.

  [[canonical?]] is pure over one facts map: an entity is canonical when it
  clears every hard negative and satisfies at least one positive axis —
  declared by moderation/authority status, or placed in a curated Library
  location."
  (:refer-clojure :exclude [resolve])
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Entity-type partitioning
;;; ---------------------------------------------------------------------------

(defn- coerce-int
  "Coerce an entity-usage `:id` (which may be int or numeric string) to
  Long, or return `nil` if it doesn't parse. Refs with non-numeric ids
  (e.g. aggregation aliases) are not real database rows and are dropped
  before any query runs."
  [id]
  (cond
    (integer? id) (long id)
    (string?  id) (try (Long/parseLong id) (catch NumberFormatException _ nil))
    :else         nil))

(defn- partition-refs
  "Bucket the input refs by entity type, dropping refs whose id doesn't
  coerce to Long. Returns `{type-group #{long-id ...}}` where
  `type-group` is the bucket name used inside this namespace
  (`:card`, `:table`, `:dashboard`, `:database`, `:transform`).
  Types governance doesn't resolve (e.g. `field`, `collection`,
  `document`) bucket out and are silently ignored."
  [refs]
  (reduce
   (fn [acc {:keys [type id]}]
     (let [n (coerce-int id)]
       (if (nil? n)
         acc
         (cond
           (contains? entity-usage/card-family-types type) (update acc :card (fnil conj #{}) n)
           (= "table" type)            (update acc :table    (fnil conj #{}) n)
           (= "dashboard" type)        (update acc :dashboard (fnil conj #{}) n)
           (= "database" type)         (update acc :database (fnil conj #{}) n)
           (= "transform" type)        (update acc :transform (fnil conj #{}) n)
           :else                       acc))))
   {}
   refs))

;;; ---------------------------------------------------------------------------
;;; Card batch query
;;; ---------------------------------------------------------------------------

(defn- card-rows
  "Issue the batched card query. LEFT JOIN to `collection` (for the
  authority level, personal-owner, and the path/type that resolve the
  card's top-level collection) and `moderation_review` (filtered to
  `most_recent = true`). A card appears N times iff N `most_recent` rows
  exist for it — [[fold-card-rows]] folds those."
  [card-ids]
  (when (seq card-ids)
    (t2/query
     {:select    [[:c.id :card-id]
                  [:c.name :card-name]
                  [:c.archived :archived]
                  [:c.dashboard_id :dashboard-id]
                  [:c.collection_id :collection-id]
                  [:col.personal_owner_id :personal-owner-id]
                  [:col.authority_level :authority-level]
                  [:col.location :collection-location]
                  [:col.type :collection-type]
                  [:mr.status :review-status]]
      :from      [[:report_card :c]]
      :left-join [[:collection :col]
                  [:= :col.id :c.collection_id]
                  [:moderation_review :mr]
                  [:and
                   [:= :mr.moderated_item_id :c.id]
                   [:= :mr.moderated_item_type "card"]
                   [:= :mr.most_recent true]]]
      :where     [:in :c.id card-ids]})))

(defn- fold-card-rows
  "Reduce the (possibly duplicated-per-card) card rows into one facts map
  per card-id, stamped `:kind :card`. `:moderation-status` folds to
  `\"verified\"` if any `most_recent` row is verified so a pathological
  multi-row state still resolves cleanly. The returned map is keyed by
  `card-id` (Long); the public `[type id-str]` re-keying happens in
  [[index-cards]]."
  [rows]
  (reduce
   (fn [acc {:keys [card-id card-name archived dashboard-id collection-id
                    personal-owner-id authority-level collection-location
                    collection-type review-status]}]
     (let [existing          (get acc card-id)
           moderation-status (if (or (= "verified" review-status)
                                     (= "verified" (:moderation-status existing)))
                               "verified"
                               (or review-status (:moderation-status existing)))]
       (assoc acc card-id
              {:kind                 :card
               :name                 card-name
               :archived?            (boolean archived)
               :dashboard-internal?  (some? dashboard-id)
               :lives-in-personal?   (some? personal-owner-id)
               :moderation-status    moderation-status
               :authority-level      authority-level
               :root-collection-type (collection/root-collection-type
                                      {:collection_id       collection-id
                                       :collection_location collection-location
                                       :collection_type     collection-type})})))
   {}
   rows))

(defn- index-cards
  "Key the per-card facts map to the public `[\"card\" id-str]` shape. Every
  card-family subtype collapses to the one `\"card\"` key — mirroring how
  extract.clj keys its sets — so the governance↔set-construction join is
  symmetric."
  [card-facts]
  (reduce-kv
   (fn [acc card-id facts]
     (assoc acc ["card" (str card-id)] facts))
   {}
   card-facts))

;;; ---------------------------------------------------------------------------
;;; Table batch query
;;; ---------------------------------------------------------------------------

(defn- table-rows
  "Batched table lookup through `:model/Table` so the model transforms
  apply — `data_authority` / `data_layer` come back as keywords with the
  legacy medallion `data_layer` values already folded to their current
  form. A raw query would skip that folding."
  [table-ids]
  (when (seq table-ids)
    (t2/select [:model/Table :id :name :archived_at :active :visibility_type
                :is_published :collection_id :data_authority :data_layer]
               :id [:in table-ids])))

(defn- index-tables
  "Key table rows by `[\"table\" id-str]` and stamp `:kind :table`.
  `:in-library?` is membership of the table's collection in `library-cids`
  (the Library root + descendants)."
  [rows library-cids]
  (reduce
   (fn [acc {:keys [id name archived_at active visibility_type is_published
                    collection_id data_authority data_layer]}]
     (assoc acc ["table" (str id)]
            {:kind                 :table
             :name                 name
             :archived-at?         (some? archived_at)
             :active?              (boolean active)
             :visibility-type-set? (some? visibility_type)
             :is-published?        (boolean is_published)
             :in-library?          (contains? library-cids collection_id)
             :data-authority       data_authority
             :data-layer           data_layer}))
   {}
   rows))

;;; ---------------------------------------------------------------------------
;;; Name-only lookups (dashboard / database / transform)
;;; ---------------------------------------------------------------------------

(defn- name-only-rows
  "Generic `:name`-only lookup against `table-kw` keyed by integer `:id`.
  Used for dashboards / databases / transforms — types the per-turn
  attribution layer needs only to render a human-readable label for."
  [table-kw ids]
  (when (seq ids)
    (t2/query
     {:select [[:id :row-id] :name]
      :from   [table-kw]
      :where  [:in :id ids]})))

(defn- index-name-only
  [rows public-type]
  (reduce
   (fn [acc {:keys [row-id name]}]
     (assoc acc [public-type (str row-id)] {:kind :other :name name}))
   {}
   rows))

;;; ---------------------------------------------------------------------------
;;; Library collection ids
;;; ---------------------------------------------------------------------------

(defn library-collection-ids
  "The set of collection ids that make up the Library — its root plus all
  descendants — or nil when the instance has no Library. Computed once per
  scoring run and threaded into [[resolve]] so the per-table
  Library-membership check is a set lookup."
  []
  (when-let [root (collection/library-collection)]
    (into #{(:id root)} (collection/descendant-ids root))))

;;; ---------------------------------------------------------------------------
;;; Public surface — batched resolve
;;; ---------------------------------------------------------------------------

(defn resolve
  "Resolve governance facts for a seq of entity-refs across all sets, given
  the Library collection-id set from [[library-collection-ids]]. Returns
  `{[type id-str] facts-map}`.

  Cards and tables carry the [[canonical?]] inputs; dashboards, databases,
  and transforms carry `:kind :other` and a `:name`. An entity the appdb
  can't find is absent from the map. Refs whose `:type` is outside the
  resolved vocabulary, or whose `:id` is non-numeric, are dropped before
  any query runs.

  One batched query per entity-type bucket, plus memoized root-collection
  lookups for cards nested inside other collections."
  [entity-refs library-cids]
  (let [{:keys [card table dashboard database transform]} (partition-refs entity-refs)]
    (merge
     (-> (card-rows  card)
         fold-card-rows
         index-cards)
     (-> (table-rows table)
         (index-tables library-cids))
     (-> (name-only-rows :report_dashboard dashboard) (index-name-only "dashboard"))
     (-> (name-only-rows :metabase_database database)  (index-name-only "database"))
     (-> (name-only-rows :transform        transform)  (index-name-only "transform")))))

;;; ---------------------------------------------------------------------------
;;; Canonical predicate
;;; ---------------------------------------------------------------------------

(defn- card-canonical?
  [{:keys [archived? dashboard-internal? lives-in-personal?
           moderation-status authority-level root-collection-type]}]
  (and (not archived?)
       (not dashboard-internal?)
       (not lives-in-personal?)
       (or (= "verified" moderation-status)
           (= "official" authority-level)
           (contains? collection/library-collection-types root-collection-type))))

(defn- table-canonical?
  [{:keys [archived-at? active? visibility-type-set?
           is-published? in-library? data-authority data-layer]}]
  (and (not archived-at?)
       active?
       (not visibility-type-set?)
       (or (= :authoritative data-authority)
           (and is-published? in-library?)
           (= :final data-layer))))

(defn canonical?
  "True iff `facts` (one value from [[resolve]]) describes a canonical data
  source. A card or table is canonical when it clears every hard negative
  and satisfies at least one positive axis. Non-card/non-table entities are
  never canonical, so a surfaced dashboard simply evaluates to false."
  [facts]
  (case (:kind facts)
    :card  (card-canonical? facts)
    :table (table-canonical? facts)
    false))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Sample resolve against a small ref list — verify shape locally.
  (resolve [{:type "card"  :id 1}
            {:type "model" :id 2}
            {:type "table" :id 3}]
           (library-collection-ids)))

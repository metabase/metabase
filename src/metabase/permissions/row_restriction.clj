(ns metabase.permissions.row-restriction
  "Which tables and databases the current user sees only some of the rows of, and the removal of metadata computed
  over all rows from what is served to them.

  Sandboxing, connection impersonation and database routing each narrow the rows a user's queries return. A Field's
  `:fingerprint` is computed by sync over every row of its table, and the fingerprints in a Card's `:result_metadata`
  over every row the query returned to whoever ran it last. Both hold exact values (min, max, quartiles) and counts
  of rows such a user may not see, so metadata endpoints remove them with [[remove-row-restricted-fingerprints]] and
  [[remove-row-restricted-card-fingerprints-by-database]] (or, where the frontend uses a Card's,
  `metabase.query-permissions.core/remove-row-restricted-card-fingerprints`). Query results get the same treatment
  from the query processor's `row-restricted-metadata` middleware.

  Every check fails closed: when the restriction cannot be resolved (a policy needs a user attribute the user lacks),
  the table or database counts as restricted."
  (:require
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.data-access-token :as data-access-token]
   [metabase.permissions.db :as perms.db]
   [metabase.permissions.util :as perms.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- database-wide-token?
  "Whether the [[data-access-token/data-access-token]] `token` narrows every table of its database: impersonation and
  routing apply per database, not per table."
  [token]
  (boolean (or (:impersonation token) (:routing token))))

(defn- database-wide-restriction?
  "Whether impersonation or routing narrows every table of `db-id` for the current user."
  [db-id]
  (database-wide-token? (data-access-token/data-access-token {:database-id db-id :table-ids #{}})))

(defn- row-restricted-by-db
  "`{table-id restricted?}` for the `table-ids` of the database `db-id`, computed from a single
  [[data-access-token/data-access-token]] call. Impersonation and routing are per-database, not per-table, so
  batching by database avoids recomputing them once per table. Fails closed on error."
  [db-id table-ids]
  (let [restrict-all (into {} (map (fn [id] [id true])) table-ids)]
    (try
      (let [token               (data-access-token/data-access-token {:database-id db-id :table-ids table-ids})
            db-wide-restricted? (database-wide-token? token)]
        (into {} (map (fn [id] [id (or db-wide-restricted? (contains? (:sandbox token) id))])) table-ids))
      (catch Exception e
        (log/debugf e "Restriction probe failed for database %d, falling back per table" db-id)
        ;; Impersonation and routing are the realistic throw sources (a missing user attribute), and both are
        ;; database-wide -- a single cheap probe with `:table-ids #{}` (which skips the per-table sandbox lookup
        ;; entirely) tells us whether that's the case, without turning every failure into an O(table count) retry.
        (try
          (if (database-wide-restriction? db-id)
            restrict-all
            ;; The probe succeeded with no impersonation/routing, so the original failure must be an isolated
            ;; per-table sandbox problem -- retry per table so one broken table doesn't drag its unrelated siblings
            ;; down with it.
            (into {}
                  (map (fn [id]
                         [id (try
                               (boolean (seq (data-access-token/data-access-token {:database-id db-id :table-ids #{id}})))
                               (catch Exception e
                                 (log/debugf e "Restriction probe failed for table %d, defaulting to restricted" id)
                                 true))]))
                  table-ids))
          (catch Exception e
            (log/debugf e "Restriction probe failed for database %d, defaulting to restricted" db-id)
            restrict-all))))))

(defn row-restricted-table-ids
  "The IDs of the `tables` (maps with `:id` and `:db_id`) whose rows sandboxing, connection impersonation or database
  routing narrows for the current user. Fails closed: a table whose restriction can't be resolved is included."
  [tables]
  (into #{}
        (comp (mapcat (fn [[db-id db-tables]]
                        (row-restricted-by-db db-id (into #{} (map :id) db-tables))))
              (keep (fn [[id restricted?]] (when restricted? id))))
        (group-by :db_id tables)))

(defn- row-restricted-database?
  [db-id]
  (try
    (or (perms.util/sandboxed-user-for-db? db-id)
        (database-wide-restriction? db-id))
    (catch Exception e
      (log/debugf e "Restriction probe failed for database %d, defaulting to restricted" db-id)
      true)))

;;; ------------------------------------------------ Field metadata ------------------------------------------------

(mr/def ::field
  [:map {:closed false, ::mr/deliberately-open true, :description "a Field, hydrated however its endpoint serves it"}
   [:table_id {:optional true} [:maybe :int]]])

(def ^:private nested-field-keys
  "Keys under which Field hydration nests another, complete Field. A dimension nests one too, as its
  `:human_readable_field`."
  [:target :name_field])

(defn- dimensions-seq
  [{:keys [dimensions]}]
  (if (map? dimensions) [dimensions] dimensions))

(defn- nested-fields
  "`field` and every Field hydrated inside it."
  [field]
  (cons field
        (into []
              (comp (filter map?) (mapcat nested-fields))
              (concat (map field nested-field-keys)
                      (map :human_readable_field (dimensions-seq field))))))

(defn- update-nested-fields
  "`field` with `f` applied to each Field hydrated directly inside it."
  [field f]
  (let [f           #(cond-> % (map? %) f)
        update-dims #(u/update-if-exists % :human_readable_field f)]
    (cond-> (reduce #(u/update-if-exists %1 %2 f) field nested-field-keys)
      (map? (:dimensions field))        (update :dimensions update-dims)
      (sequential? (:dimensions field)) (update :dimensions (partial mapv update-dims)))))

(defn- strip-field
  [restricted-table-id? field]
  (-> (cond-> field
        (restricted-table-id? (:table_id field)) (dissoc :fingerprint))
      (update-nested-fields (partial strip-field restricted-table-id?))))

(mu/defn remove-row-restricted-fingerprints :- [:sequential ::field]
  "`fields` without the `:fingerprint` of each Field (including the Fields hydrated in them as `:target`,
  `:name_field` and a dimension's `:human_readable_field`) whose table's rows are narrowed for the current user. See
  the namespace docstring.

  The database of each table is taken from `table-id->db-id` or a Field's hydrated `:table`, and looked up
  otherwise."
  ([fields :- [:maybe [:sequential ::field]]]
   (remove-row-restricted-fingerprints fields {}))
  ([fields          :- [:maybe [:sequential ::field]]
    table-id->db-id :- [:map-of ::lib.schema.id/table ::lib.schema.id/database]]
   (let [nested          (into [] (mapcat nested-fields) fields)
         table-ids       (into #{}
                               (comp (filter :fingerprint)
                                     (keep :table_id)
                                     (filter pos-int?))
                               nested)
         table-id->db-id (into table-id->db-id
                               (keep (fn [{:keys [table]}]
                                       (when (and (pos-int? (:id table)) (pos-int? (:db_id table)))
                                         [(:id table) (:db_id table)])))
                               nested)]
     (if (or (empty? table-ids) (nil? api/*current-user-id*))
       (vec fields)
       (let [unknown    (into #{} (remove table-id->db-id) table-ids)
             tables     (concat (for [id table-ids
                                      :let [db-id (table-id->db-id id)]
                                      :when db-id]
                                  {:id id, :db_id db-id})
                                (when (seq unknown)
                                  (perms.db/table-database-ids unknown)))
             restricted (row-restricted-table-ids tables)]
         (if (empty? restricted)
           (vec fields)
           (mapv (partial strip-field restricted) fields)))))))

(defn remove-row-restricted-fingerprints-from-field
  "[[remove-row-restricted-fingerprints]] for the single `field`."
  [field]
  (first (remove-row-restricted-fingerprints [field])))

;;; ------------------------------------------------- Card metadata ------------------------------------------------

(mr/def ::card
  [:map {:closed false, ::mr/deliberately-open true, :description "a Card, with as many of its columns as its endpoint serves"}
   [:id          {:optional true} [:maybe :int]]
   [:database_id {:optional true} [:maybe :int]]])

(defn- fingerprinted? [card]
  (some :fingerprint (:result_metadata card)))

(mu/defn remove-row-restricted-card-fingerprints-with :- [:sequential [:maybe ::card]]
  "`cards` without the `:fingerprint` of their `:result_metadata` columns when the current user's rows may be narrowed
  in the Card's database (or it has no `:database_id`), unless `(cards-row-restricted? candidates)` clears the Card.
  `cards-row-restricted?` takes those candidate Cards and returns a map of Card ID to whether running the Card would
  be row-restricted; only a definite `false` keeps the fingerprints. Nil entries (a text dashcard's Card) pass through. See the namespace
  docstring.

  [[metabase.query-permissions.core/remove-row-restricted-card-fingerprints]] passes one that judges a Card
  by the Tables its query reads; that takes the query processor, which `permissions` cannot depend on."
  [cards                 :- [:maybe [:sequential [:maybe ::card]]]
   cards-row-restricted? :- [:=> [:cat [:sequential ::card]] :map]]
  (let [fingerprinted (filterv fingerprinted? cards)]
    (if (or (empty? fingerprinted) (nil? api/*current-user-id*))
      (vec cards)
      (let [restricted-db-ids (into #{}
                                    (comp (keep :database_id) (distinct) (filter row-restricted-database?))
                                    fingerprinted)
            candidate?        (fn [card]
                                (and (fingerprinted? card)
                                     (or (nil? (:database_id card))
                                         (contains? restricted-db-ids (:database_id card)))))
            restricted?       (let [candidates (filterv candidate? cards)]
                                (if (seq candidates)
                                  (try
                                    (cards-row-restricted? candidates)
                                    (catch Exception e
                                      (log/debugf e "Could not tell whether Cards %s are row-restricted" (mapv :id candidates))
                                      {}))
                                  {}))
            ;; only a definite `false` keeps them: a Card missing from the map, or mapped to nil, is unresolved
            strip?            (fn [card]
                                (and (candidate? card)
                                     (not (false? (get restricted? (:id card))))))]
        (mapv (fn [card]
                (cond-> card
                  (strip? card) (update :result_metadata (partial mapv #(dissoc % :fingerprint)))))
              cards)))))

(mu/defn remove-row-restricted-card-fingerprints-by-database :- [:sequential [:maybe ::card]]
  "`cards` without the `:fingerprint` of their `:result_metadata` columns when the current user's rows may be narrowed
  in the Card's database: any restriction in the database removes them, and a Card with no `:database_id` counts as
  restricted. No Card is preprocessed, so this is for lists of Cards (Card lists, dashboards, search), which do not
  use the fingerprints. It removes at least as much as
  [[metabase.query-permissions.core/remove-row-restricted-card-fingerprints]], which a Card's own endpoints use."
  [cards :- [:maybe [:sequential [:maybe ::card]]]]
  (remove-row-restricted-card-fingerprints-with cards (constantly {})))

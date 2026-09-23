(ns metabase.jev.apps.table-facts
  "A Metabase-native ontology of your warehouse's tables — computed live, per request, never stored.

  The premise: the useful classifications are not about the customer's domain (\"Revenue\", \"Pipeline\" —
  unstable, need an LLM to name) but about how each table sits *in Metabase* — is it a fact table or a
  dimension, is it the canonical copy or a stale backup, is it a reference hub everything joins to. Those
  are stable, observable, and cross-cutting: the same fact helps query-building target-selection, dashboard
  authoring, and Metabot retrieval.

  Two layers, the pattern we keep landing on:

    1. DETERMINISTIC facts (no Jev): value-free structural + usage signals Metabase already has —
       estimated row count, view_count (usage), field count, the FK join graph (how many tables point AT
       this one = a hub/dimension signal; how many it points OUT to = a fact signal), and per-field
       distinct/null ratios + role. This is the STATE Jev reads.

    2. JEV (the judgment): classify each table's ROLE against a FIXED taxonomy (fact / dimension / lookup /
       junk) with a `choice`, and score `canonical?` with a `noul` — fed the Layer-1 facts as state, run in
       PARALLEL. Calibration is the feature: a genuinely ambiguous table scores low-confidence and the UI
       can fall back to plain usage ordering.

  Read-only, live. Prototype scaffolding."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.jev.client :as jev]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------------------------------
;;; Layer 1 — deterministic facts (the state Jev reads)
;;; ---------------------------------------------------------------------------------------------------

(defn- field-role
  "Coarse role of a field from its types. Value-free."
  [{:keys [base_type semantic_type]}]
  (let [bt (some-> base_type keyword)
        st (some-> semantic_type keyword)]
    (cond
      (isa? st :type/PK)         :key
      (isa? st :type/FK)         :key
      (isa? st :type/Latitude)   :geo
      (isa? st :type/Longitude)  :geo
      (isa? bt :type/Temporal)   :temporal
      (isa? bt :type/Number)     :numeric
      :else                      :text)))

(defn- distinct-ratio
  "distinct-count / row-count from the field fingerprint, or nil when either is unknown. High ⇒ key-like."
  [field row-count]
  (let [distinct (get-in field [:fingerprint :global :distinct-count])]
    (when (and distinct row-count (pos? row-count))
      (double (/ distinct row-count)))))

(defn- field-fact
  [field row-count]
  {:name          (:name field)
   :role          (field-role field)
   :distinct_ratio (some-> (distinct-ratio field row-count) (* 1.0))
   :null_ratio    (get-in field [:fingerprint :global :nil%])})

(defn- join-in-degrees
  "For every table in `table-ids`, how many FK fields on those tables point at it — i.e. how many places
  reference this table. A high in-degree marks a reference/dimension hub. Two flat queries, no Jev."
  [table-ids]
  (let [;; fk fields on these tables and the target field they point at
        fk-fields   (when (seq table-ids)
                      (t2/select [:model/Field :fk_target_field_id]
                                 :table_id [:in table-ids] :active true
                                 :fk_target_field_id [:not= nil]))
        target-ids  (distinct (keep :fk_target_field_id fk-fields))
        target->tbl (when (seq target-ids)
                      (t2/select-pk->fn :table_id [:model/Field :id :table_id] :id [:in target-ids]))
        counts      (frequencies (keep (comp target->tbl :fk_target_field_id) fk-fields))]
    (into {} (map (fn [tid] [tid (get counts tid 0)])) table-ids)))

(defn- fingerprint-row-estimate
  "A lower-bound row estimate from fingerprints: the largest per-field distinct-count. A table can't have
  fewer rows than its most-distinct column has distinct values. Used when the warehouse didn't report an
  estimated_row_count (common)."
  [fields]
  (let [distincts (keep #(get-in % [:fingerprint :global :distinct-count]) fields)]
    (when (seq distincts) (apply max distincts))))

(defn- table-facts
  "Layer-1 facts for a single table + its fields, given the precomputed join in-degree map."
  [table fields in-degrees]
  (let [reported  (:estimated_row_count table)
        row-count (or reported (fingerprint-row-estimate fields))
        fk-out    (count (filter #(isa? (some-> (:semantic_type %) keyword) :type/FK) fields))]
    {:table_id       (:id table)
     :name           (:name table)
     :row_count      row-count
     :row_estimated  (nil? reported)
     :view_count     (:view_count table)
     :field_count    (count fields)
     :join_in_degree (get in-degrees (:id table) 0)
     :fk_out_count   fk-out
     :fields         (mapv #(field-fact % row-count) fields)}))

(defn- database-table-facts
  "Layer-1 facts for every active table in `db-id`."
  [db-id]
  (let [tables     (t2/select :model/Table :db_id db-id :active true
                              {:order-by [[:view_count :desc]]})
        table-ids  (mapv :id tables)
        fields     (when (seq table-ids)
                     (group-by :table_id
                               (t2/select :model/Field :table_id [:in table-ids] :active true
                                          :visibility_type [:not-in ["retired"]])))
        in-degrees (join-in-degrees table-ids)]
    (mapv (fn [t] (table-facts t (get fields (:id t) []) in-degrees)) tables)))

;;; ---------------------------------------------------------------------------------------------------
;;; Layer 2 — Jev classification over the facts (fixed taxonomy, parallel)
;;; ---------------------------------------------------------------------------------------------------

(def ^:private table-roles
  "The fixed taxonomy Jev picks from. Metabase-native, not domain-specific."
  {:fact      "a fact/event table: many rows, points OUT to dimensions via foreign keys, holds measures"
   :dimension "a dimension/entity table: describes things (customers, products), referenced BY many tables"
   :lookup    "a small lookup/reference table: few rows, mostly categories or codes"
   :junk      "a backup, staging, temp, or derived scratch table — not a primary modeling target"})

(defn- describe-facts
  "A compact, value-free English summary of a table's Layer-1 facts for Jev to read as state."
  [{:keys [name row_count view_count field_count join_in_degree fk_out_count fields]}]
  (let [roles (frequencies (map :role fields))]
    (str "Table \"" name "\": "
         (or row_count "unknown") " rows, "
         field_count " columns"
         " (" (get roles :numeric 0) " numeric, " (get roles :temporal 0) " temporal, "
         (get roles :key 0) " keys), "
         "referenced by " join_in_degree " foreign keys, "
         "points out to " fk_out_count " tables, "
         "viewed " (or view_count 0) " times.")))

(defn- classify-table
  "One Jev request per table: role `choice` + `canonical?` `noul`, fed the Layer-1 facts as state.
  Returns the facts enriched with `:role`, `:role_confidence`, `:canonical`."
  [facts]
  (let [state  {:table (describe-facts facts)}
        result (jev/ask state
                        {:role      (jev/choice "Classify this table's role in the data model." table-roles)
                         :canonical (jev/noul (str "Is this the canonical, primary table for its concept — "
                                                   "as opposed to a backup, staging, or duplicate copy?"))})]
    (if (:ok result)
      (let [answers (:answers result)]
        (assoc facts
               :role            (get-in answers [:role :choice])
               :role_confidence (get-in answers [:role :confidence])
               :canonical       (get-in answers [:canonical :noul])))
      (assoc facts :role nil :canonical nil))))

;;; ---------------------------------------------------------------------------------------------------
;;; Endpoint
;;; ---------------------------------------------------------------------------------------------------

(defn database-table-ontology
  "Classify every table in `db-id`: Layer-1 facts + Jev role/canonical, classified in parallel. Returns a
  ranked view for the FE data picker — canonical facts/dimensions up, junk/backups down."
  [db-id]
  (api/read-check :model/Database db-id)
  (let [facts (database-table-facts db-id)]
    (if-not (jev/key-present?)
      {:database_id db-id :jev_available false :tables facts}
      (let [started    (System/nanoTime)
            classified (vec (pmap classify-table facts))]
        {:database_id db-id
         :jev_available true
         :tables       classified
         :elapsed_ms   (/ (- (System/nanoTime) started) 1e6)}))))

(api.macros/defendpoint :get "/database/:id/table-ontology" :- :any
  "A Metabase-native ontology of a database's tables: deterministic structural + usage facts, classified by
  Jev into a fixed role taxonomy (fact/dimension/lookup/junk) with a canonical-ness score. For the FE to
  re-rank the data picker — canonical fact/dimension tables up, backups down. Read-only, live. Prototype."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (database-table-ontology id))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/database/…` table-ontology routes."
  (api.macros/ns-handler *ns*))

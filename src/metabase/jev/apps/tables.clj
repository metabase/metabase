(ns metabase.jev.apps.tables
  "Jev-powered *suggestions* for a table's fields, for the admin Table Metadata page.

  Metabase's sync assigns each field a `semantic_type` (via ~60 name regexes + fingerprint heuristics) and,
  where enabled, a `data_sensitivity` class; many real columns come back untyped. This endpoint samples a
  handful of rows once (ONE warehouse query for the whole table) and asks Jev — per field — two judgments
  off the field name + sample values:

    * semantic type    — a `choice` over exactly the semantic types compatible with that field's base type
                         (we replicate the frontend `getCompatibleSemanticTypes` rule off the type
                         hierarchy), plus `none`.
    * data sensitivity — a `choice` over the canonical sensitivity taxonomy
                         ([[metabase.lib.schema.metadata/column-data-sensitivity-types]]): SEC_KEY, PHI,
                         PII, PCI_FIN, … so \"PII\" is a whole taxonomy, not a yes/no.

  It returns a suggestion per field (`current` vs `suggested`, with Jev's confidence) so a widget can show
  every field's read, surface the real changes, and let an admin accept them. Judgments run at the speed of
  a human looking at the page — a bounded fan-out of one small Jev call per field, not a batch job.

  Prototype scaffolding under `metabase.jev.*`; easy to delete, does not touch the real table API."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.jev.client :as jev]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------------------------------
;;; Candidate semantic types per field — derived from the type hierarchy, matching the FE picker
;;;
;;; The frontend's `getCompatibleSemanticTypes` offers a semantic type for a field when it derives from
;;; one of the field's "level-one" data types (a direct child of :type/*), with special cases for
;;; Category (any non-boolean) and Name (text only). We replicate that off the same `clojure.core` global
;;; hierarchy, so we only ever ask Jev to choose among labels valid for that field.
;;; ---------------------------------------------------------------------------------------------------

(def ^:private level-one-types
  "Direct children of `:type/*` — the field's coarse data-type family (Text, Number, Temporal, …)."
  (delay (filter #(contains? (parents %) :type/*) (descendants :type/*))))

;; Jev criteria keys are simple keywords; a semantic type's bare name (:Currency for :type/Currency) is
;; unambiguous within one field's candidate set, and we re-qualify it on the way back.
(defn- semantic-type->criteria-key [semantic-type] (keyword (name semantic-type)))

(defn- criteria-key->semantic-type
  "Invert [[semantic-type->criteria-key]] back to a full `:type/…` keyword (nil for the `:none` escape)."
  [k]
  (when (and k (not= k :none))
    (keyword "type" (name k))))

(defn- compatible-semantic-types
  "The semantic types compatible with a field of `field-type`, matching the FE picker rule."
  [field-type]
  (let [text?          (isa? field-type :type/Text)
        boolean?       (isa? field-type :type/Boolean)
        field-level-1  (filter #(isa? field-type %) @level-one-types)]
    (->> (descendants :Semantic/*)
         (filter (fn [st]
                   (cond
                     (= st :type/Category) (not boolean?)
                     (= st :type/Name)     text?
                     :else                 (boolean (some #(isa? st %) field-level-1)))))
         sort)))

(defn- semantic-criteria
  "Jev `choice` criteria map {criteria-key type-name} for a field, or nil when there is nothing to offer
  (e.g. a boolean field), so the caller can skip the Jev call."
  [field-type]
  (let [types (compatible-semantic-types field-type)]
    (when (seq types)
      (into {} (map (fn [st] [(semantic-type->criteria-key st) (name st)])) types))))

;;; ---------------------------------------------------------------------------------------------------
;;; Data-sensitivity taxonomy — the canonical classes, described for Jev
;;; ---------------------------------------------------------------------------------------------------

(def ^:private sensitivity-descriptions
  "Human-readable meaning of each `column-data-sensitivity-types` class, for Jev's `choice` criteria."
  {:SEC_KEY       "Security credentials & secrets — passwords, API keys, tokens, private keys"
   :SYS_TELEMETRY "Infrastructure & system identifiers — IP/MAC addresses, device IDs, session/trace IDs"
   :PHI           "Protected health information — diagnoses, medications, treatment, insurance"
   :BIO_GEN       "Biometric & genetic data — fingerprints, facial scans, DNA"
   :PCI_FIN       "Financial & payment-card data — card numbers, bank accounts, CVV"
   :SENS_PERS     "Special-category personal traits — race, religion, sexuality, political views"
   :PII           "Personally identifiable information — name, email, phone, address, SSN"
   :CORP_IP       "Intellectual property & source code"
   :BIZ_CONF      "Confidential business data — internal financials, strategy, non-public metrics"
   :PUBLIC        "Non-sensitive / public information"})

(def ^:private sensitivity-criteria
  "Jev `choice` criteria for the sensitivity taxonomy, ordered most-severe first."
  (into {} (map (fn [c] [c (sensitivity-descriptions c)]))
        lib.schema.metadata/column-data-sensitivity-types))

;;; ---------------------------------------------------------------------------------------------------
;;; Sampling
;;; ---------------------------------------------------------------------------------------------------

(def ^:private sample-limit 20)

(defn- column-samples
  "Run ONE `table-rows-sample` query over `fields` and return a vector, parallel to `fields`, of each
  field's distinct sample values (up to a few, as strings). nil on failure — the endpoint still returns
  name-only suggestions."
  [table fields]
  (try
    (let [rff  (fn [_meta] (fn ([] []) ([acc] acc) ([acc row] (conj acc (vec row)))))
          rows (table-rows-sample/table-rows-sample table fields rff {:limit sample-limit})]
      (mapv (fn [i]
              (->> rows
                   (map #(nth % i nil))
                   (remove nil?)
                   distinct
                   (take 6)
                   (mapv str)))
            (range (count fields))))
    (catch Throwable e
      (log/warn e "Jev suggestions: table-rows-sample failed; falling back to name-only")
      nil)))

;;; ---------------------------------------------------------------------------------------------------
;;; Per-field Jev judgment
;;; ---------------------------------------------------------------------------------------------------

(defn- suggest-field
  "Ask Jev for one field's semantic type + data-sensitivity class. Returns a suggestion map."
  [field samples]
  (let [base-type      (:base_type field)
        field-type     (or (:effective_type field) base-type)
        current-sem    (:semantic_type field)
        current-sens   (:data_sensitivity field)
        sem-crit       (if (#{:type/PK :type/FK} current-sem)
                         {(semantic-type->criteria-key current-sem) (name current-sem)}
                         (semantic-criteria field-type))
        base-result    {:field_id           (:id field)
                        :field_name         (:name field)
                        :base_type          base-type
                        :current            current-sem
                        :current_sensitivity current-sens
                        :sample_values      samples}]
    (if-not sem-crit
      (assoc base-result :suggested nil :confidence nil :sensitivity nil :skipped true)
      (let [state     {:column_name   (:name field)
                       :base_type     (name base-type)
                       :current_semantic_type current-sem
                       :fk_target_field_id (:fk_target_field_id field)
                       :sample_values (or samples [])}
            questions {:semantic_type (jev/choice
                                       (str "What semantic type best describes the column \"" (:name field)
                                            "\" from its name and sample values? Pick 'none' if nothing fits.")
                                       (assoc sem-crit :none "None of these — a plain, un-annotated column"))
                       :sensitivity   (jev/choice
                                       (str "What data-sensitivity class does the column \"" (:name field)
                                            "\" fall into? Pick 'PUBLIC' if it holds nothing sensitive.")
                                       sensitivity-criteria)}
            result    (jev/ask state questions)]
        (if-not (:ok result)
          (assoc base-result :suggested nil :confidence nil :sensitivity nil :error (:error result)
                 :usage (:usage result))
          (let [sem-ans   (get-in result [:answers :semantic_type])
                sens-ans  (get-in result [:answers :sensitivity])
                sem-type  (criteria-key->semantic-type (some-> (:choice sem-ans) keyword))
                sens-cls  (some-> (:choice sens-ans) keyword)]
            (assoc base-result
                   :usage         (:usage result)
                   :model         (:model result)
                   :suggested     sem-type
                   :confidence    (:confidence sem-ans)
                   :probabilities (:probabilities sem-ans)
                   :sensitivity   {:suggested  (when (not= sens-cls :PUBLIC) sens-cls)
                                   :class      sens-cls
                                   :confidence (:confidence sens-ans)})))))))

;;; ---------------------------------------------------------------------------------------------------
;;; Endpoint
;;; ---------------------------------------------------------------------------------------------------

(defn table-suggestions
  "Suggestions for every active field of `table-id`. One sample query + one bounded-parallel Jev call per
  field. Returns `{:table_id :table_name :fields [suggestion …] :jev_available bool}`."
  [table-id]
  (let [table  (api/read-check :model/Table table-id)
        fields (vec (t2/select :model/Field
                               :table_id table-id :active true :visibility_type [:not-in ["retired"]]
                               {:order-by [[:position :asc]]}))]
    (if-not (jev/key-present?)
      {:table_id table-id :table_name (:name table) :jev_available false :fields []}
      (let [started (System/nanoTime)
            samples (column-samples table fields)
            results (->> (map-indexed vector fields)
                         (pmap (fn [[i field]]
                                 (suggest-field field (when samples (nth samples i nil)))))
                         vec)]
        {:table_id table-id :table_name (:name table) :jev_available true :fields results
         :elapsed_ms (/ (- (System/nanoTime) started) 1e6)
         :call_count (count (remove :skipped results))
         :unreported_calls (count (filter #(and (not (:skipped %)) (nil? (:usage %))) results))
         :usage (reduce (fn [total result]
                          (merge-with + total (select-keys (:usage result) [:input_tokens :output_tokens])))
                        {:input_tokens 0 :output_tokens 0} results)}))))

(api.macros/defendpoint :get "/table/:id/suggestions" :- :any
  "Jev-powered semantic-type + data-sensitivity suggestions for every field of a table.

  Samples the table once, then asks Jev per field for the best semantic type (from the set valid for that
  field's base type) and its data-sensitivity class. Returns a suggestion per field with `current` vs
  `suggested` and Jev's confidence so a widget can surface only real changes and let an admin accept them.
  Requires read access to the table and `JEV_KEY` in the server environment. Prototype scaffolding."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (table-suggestions id))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/table/…` suggestion routes."
  (api.macros/ns-handler *ns*))

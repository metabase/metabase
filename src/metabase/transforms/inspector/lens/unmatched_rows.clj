(ns metabase.transforms.inspector.lens.unmatched-rows
  "Unmatched Rows lens - analyze rows that failed to join.

   This is a drill-down lens triggered from join-analysis when
   null counts are significant. For each outer join, it shows two types of samples:

   1. 'Truly unmatched' - rows where LHS key exists but no RHS match was found
      (LHS IS NOT NULL AND RHS IS NULL)
   2. 'Null source key' - rows where LHS key is NULL (can't match anything)
      (LHS IS NULL)

   For a query like: orders LEFT JOIN customers ON orders.customer_id = customers.id
   - Card 1: Orders with a customer_id that doesn't exist in customers
   - Card 2: Orders with NULL customer_id (no customer specified)

   Trigger: join-step card shows > 5% null rate
   Alert: shown when > 20% null rate

   When triggered with params {:join-step N}, only shows that join.
   Without params, shows all outer joins.

   Layout: :flat"
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms.inspector.lens.core :as lens.core]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :unmatched-rows 100 true)

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- strip-join-to-essentials
  "Keep only the essential parts of a join for the unmatched rows query."
  [join]
  (-> join
      (select-keys [:lib/type :strategy :alias :conditions :stages])
      (update :stages (fn [stages]
                        (mapv #(select-keys % [:lib/type :source-table]) stages)))))

(defn- query-with-n-joins
  "Return a copy of query with only the first N joins."
  [query n]
  (if (zero? n)
    (update-in query [:stages 0] dissoc :joins)
    (update-in query [:stages 0 :joins] #(vec (take n %)))))

(defn- get-rhs-field-ref
  "Extract the RHS field reference from an MBQL join condition.
   The RHS field is the one with a :join-alias in its metadata."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts _lhs rhs] condition]
        (when (and (vector? rhs)
                   (= :field (first rhs))
                   (:join-alias (second rhs)))
          rhs)))))

(defn- get-lhs-field-ref
  "Extract the LHS field reference from an MBQL join condition.
   The LHS field is the one without a :join-alias (base table) or with a
   different join-alias (from a previous join)."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts lhs _rhs] condition]
        (when (and (vector? lhs) (= :field (first lhs)))
          lhs)))))

(defn- fresh-uuid-field-ref
  "Return a copy of the field ref with a fresh UUID."
  [field-ref]
  (when (and (vector? field-ref) (= :field (first field-ref)) (map? (second field-ref)))
    (assoc-in field-ref [1 :lib/uuid] (str (random-uuid)))))

(defn- make-field-ref
  "Create a field reference, optionally with a join alias."
  [field-id join-alias]
  [:field
   (cond-> {:lib/uuid (str (random-uuid))}
     join-alias (assoc :join-alias join-alias))
   field-id])

(defn- get-table-field-refs
  "Get field references for all columns of a table."
  [db-id table-id join-alias]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        fields (lib.metadata/fields mp table-id)]
    (mapv #(make-field-ref (:id %) join-alias) fields)))

(defn- find-table-for-join-alias
  "Find the source-table for a join with the given alias."
  [join-structure alias]
  (some #(when (= (:alias %) alias) (:source-table %)) join-structure))

(defn- make-base-unmatched-query
  "Build base query structure for unmatched rows analysis.
   Returns {:query <base-query> :lhs-field :rhs-field :lhs-fields :base-fields} or nil.

   - lhs-fields: columns from the LHS of this join (useful for truly-unmatched)
   - base-fields: columns from the base table (useful for null-source-key when LHS is from a LEFT JOIN)"
  [ctx step]
  (let [{:keys [preprocessed-query join-structure db-id]} ctx
        join (nth join-structure (dec step))
        mbql-join (nth (get-in preprocessed-query [:stages 0 :joins]) (dec step))
        rhs-field (get-rhs-field-ref (:conditions mbql-join))
        lhs-field (get-lhs-field-ref (:conditions mbql-join))
        ;; Determine LHS table from the join condition's LHS field
        lhs-join-alias (when lhs-field (:join-alias (second lhs-field)))
        lhs-table-id (if lhs-join-alias
                       (find-table-for-join-alias join-structure lhs-join-alias)
                       (get-in preprocessed-query [:stages 0 :source-table]))
        lhs-fields (when lhs-table-id
                     (get-table-field-refs db-id lhs-table-id lhs-join-alias))
        ;; Base table fields (always non-NULL for null-source-key case)
        base-table-id (get-in preprocessed-query [:stages 0 :source-table])
        base-fields (get-table-field-refs db-id base-table-id nil)]
    (when (and rhs-field lhs-field lhs-fields)
      {:base-query (-> preprocessed-query
                       (query-with-n-joins step)
                       (update-in [:stages 0] (fn [stage]
                                                (-> stage
                                                    (select-keys [:lib/type :source-table])
                                                    (assoc :joins (mapv strip-join-to-essentials
                                                                        (take step (get-in preprocessed-query [:stages 0 :joins]))))
                                                    (assoc :limit 100)))))
       :lhs-field lhs-field
       :rhs-field rhs-field
       :lhs-fields lhs-fields
       :base-fields base-fields})))

(defn- make-truly-unmatched-query
  "Build a query for rows where LHS key exists but no RHS match was found.
   (LHS IS NOT NULL AND RHS IS NULL)
   Shows LHS columns since those have actual data."
  [ctx step]
  (when-let [{:keys [base-query lhs-field rhs-field lhs-fields]} (make-base-unmatched-query ctx step)]
    (-> base-query
        (assoc-in [:stages 0 :fields] lhs-fields)
        (assoc-in [:stages 0 :filters]
                  [[:not-null {:lib/uuid (str (random-uuid))} (fresh-uuid-field-ref lhs-field)]
                   [:is-null {:lib/uuid (str (random-uuid))} (fresh-uuid-field-ref rhs-field)]]))))

(defn- make-null-source-key-query
  "Build a query for rows where LHS key is NULL (no key to match on).
   (LHS IS NULL)
   Shows base table columns since LHS columns may all be NULL if LHS came from a LEFT JOIN."
  [ctx step]
  (when-let [{:keys [base-query lhs-field base-fields]} (make-base-unmatched-query ctx step)]
    (-> base-query
        (assoc-in [:stages 0 :fields] base-fields)
        (assoc-in [:stages 0 :filters]
                  [[:is-null {:lib/uuid (str (random-uuid))} (fresh-uuid-field-ref lhs-field)]]))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- truly-unmatched-card
  "Generate a card for rows where LHS key exists but RHS didn't match."
  [ctx step]
  (let [{:keys [join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [alias strategy]} join
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)]
    (when is-outer?
      (when-let [query (make-truly-unmatched-query ctx step)]
        {:id            (str "truly-unmatched-" step)
         :section_id    "samples"
         :title         (str alias ": Rows with key but no match")
         :display       :table
         :dataset_query query
         :metadata      {:card_type     :truly_unmatched
                         :join_step     step
                         :join_alias    alias
                         :join_strategy strategy}}))))

(defn- null-source-key-card
  "Generate a card for rows where LHS key is NULL."
  [ctx step]
  (let [{:keys [join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [alias strategy]} join
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)]
    (when is-outer?
      (when-let [query (make-null-source-key-query ctx step)]
        {:id            (str "null-source-key-" step)
         :section_id    "samples"
         :title         (str alias ": Rows with NULL source key")
         :display       :table
         :dataset_query query
         :metadata      {:card_type     :null_source_key
                         :join_step     step
                         :join_alias    alias
                         :join_strategy strategy}}))))

(defn- cards-for-join
  "Generate both unmatched cards for a specific join step."
  [ctx step]
  (keep identity [(truly-unmatched-card ctx step)
                  (null-source-key-card ctx step)]))

(defn- all-cards
  "Generate sample cards for all outer joins, optionally filtered by join_step."
  [ctx params]
  (let [{:keys [join-structure]} ctx
        ;; Parse to int - may be string from query params
        requested-step (some-> (:join_step params) str parse-long)
        join-count (count join-structure)]
    (into []
          (mapcat (fn [step]
                    (when (or (nil? requested-step) (= step requested-step))
                      (cards-for-join ctx step))))
          (range 1 (inc join-count)))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :unmatched-rows
  [_ ctx]
  ;; Only applicable for MBQL with outer joins
  (and (= (:source-type ctx) :mbql)
       (:has-joins? ctx)
       (:preprocessed-query ctx)
       (some #(contains? #{:left-join :right-join :full-join} (:strategy %))
             (:join-structure ctx))))

(defmethod lens.core/lens-metadata :unmatched-rows
  [_ _ctx]
  {:id           "unmatched-rows"
   :display_name "Unmatched Rows"
   :description  "Sample rows that failed to join"})

(defmethod lens.core/make-lens :unmatched-rows
  [_ ctx params]
  (let [cards (all-cards ctx params)
        outer-join-count (count (filter #(contains? #{:left-join :right-join :full-join} (:strategy %))
                                        (:join-structure ctx)))
        requested-step (:join_step params)
        title (if requested-step
                (str "Unmatched Rows - Join " requested-step)
                "Unmatched Rows")]
    {:id           "unmatched-rows"
     :display_name title
     :summary      (if (seq cards)
                     {:text       (str "Analyzing unmatched rows for " outer-join-count " outer join(s)")
                      :highlights [{:label "Outer Joins" :value outer-join-count}
                                   {:label "Sample Cards" :value (count cards)}]}
                     {:text       "No outer joins with detectable join conditions"
                      :highlights []})
     :sections     [{:id     "samples"
                     :title  "Unmatched Row Samples"
                     :layout :flat}]
     :cards        cards}))

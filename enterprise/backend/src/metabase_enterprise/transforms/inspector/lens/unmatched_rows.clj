(ns metabase-enterprise.transforms.inspector.lens.unmatched-rows
  "Unmatched Rows lens - analyze rows that failed to join.

   This is a drill-down lens triggered from join-analysis when
   null counts are significant. It shows sample unmatched rows
   from the SOURCE table where the join didn't match.

   For a query like: orders LEFT JOIN customers ON orders.customer_id = customers.id
   We show orders rows where there's no matching customer.

   Trigger: join-step card shows > 5% null rate
   Alert: shown when > 20% null rate

   When triggered with params {:join-step N}, only shows that join.
   Without params, shows all outer joins.

   Layout: :flat"
  (:require
   [metabase-enterprise.transforms.inspector.lens.core :as lens.core]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]))

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

(defn- make-unmatched-rows-query
  "Build a query that returns rows from the LHS that didn't match in join N.

   Determines the LHS table by inspecting the join condition's LHS field:
   - If LHS field has no join-alias → base table
   - If LHS field has a join-alias → the table from that join

   Strategy: Take the original query with N joins, strip aggregations,
   select fields from the LHS table, add a filter for IS NULL on the RHS join key,
   add a limit."
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
                     (get-table-field-refs db-id lhs-table-id lhs-join-alias))]
    (when (and rhs-field lhs-fields)
      (-> preprocessed-query
          (query-with-n-joins step)
          (update-in [:stages 0] (fn [stage]
                                   (-> stage
                                       ;; Keep source and joins, remove aggregations/breakouts
                                       (select-keys [:lib/type :source-table])
                                       ;; Add back the stripped joins
                                       (assoc :joins (mapv strip-join-to-essentials
                                                           (take step (get-in preprocessed-query [:stages 0 :joins]))))
                                       ;; Select fields from LHS table
                                       (assoc :fields lhs-fields)
                                       ;; Filter for unmatched: RHS key IS NULL
                                       (assoc :filters [[:is-null
                                                         {:lib/uuid (str (random-uuid))}
                                                         (fresh-uuid-field-ref rhs-field)]])
                                       ;; Limit results
                                       (assoc :limit 100))))))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- sample-card-for-join
  "Generate a sample card for unmatched rows of a specific join."
  [ctx step]
  (let [{:keys [join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [alias strategy]} join
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)]
    (when is-outer?
      (when-let [query (make-unmatched-rows-query ctx step)]
        {:id            (str "unmatched-sample-" step)
         :section-id    "samples"
         :title         (str "Unmatched rows for join: " alias)
         :display       :table
         :dataset-query query
         :metadata      {:card-type     :unmatched-sample
                         :join-step     step
                         :join-alias    alias
                         :join-strategy strategy}}))))

(defn- all-cards
  "Generate sample cards for all outer joins, optionally filtered by join-step."
  [ctx params]
  (let [{:keys [join-structure]} ctx
        ;; Parse to int - may be string from query params
        requested-step (some-> (:join-step params) str parse-long)
        join-count (count join-structure)]
    (into []
          (keep (fn [step]
                  (when (or (nil? requested-step) (= step requested-step))
                    (sample-card-for-join ctx step))))
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
   :display-name "Unmatched Rows"
   :description  "Sample rows that failed to join"})

(defmethod lens.core/make-lens :unmatched-rows
  [_ ctx params]
  (let [cards (all-cards ctx params)
        join-count (count cards)
        requested-step (:join-step params)
        title (if requested-step
                (str "Unmatched Rows - Join " requested-step)
                "Unmatched Rows")]
    {:id           "unmatched-rows"
     :display-name title
     :summary      (if (seq cards)
                     {:text       (str "Sample unmatched rows for " join-count " outer join(s)")
                      :highlights [{:label "Outer Joins" :value join-count}]}
                     {:text       "No outer joins with detectable join conditions"
                      :highlights []})
     :sections     [{:id     "samples"
                     :title  "Unmatched Row Samples"
                     :layout :flat}]
     :cards        cards}))

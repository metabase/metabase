(ns metabase-enterprise.transforms.inspector-v2.lens.unmatched-rows
  "Unmatched Rows lens - analyze rows that failed to join.

   This is a drill-down lens triggered from join-analysis when
   null counts are significant. It shows sample unmatched rows
   from the transform output where the RHS join key is NULL.

   Trigger: join-step card shows > 5% null rate
   Alert: shown when > 20% null rate

   When triggered with params {:join-step N}, only shows that join.
   Without params, shows all outer joins.

   Layout: :flat"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.inspector-v2.lens.core :as lens.core]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :unmatched-rows 100 true)

;;; -------------------------------------------------- RHS Field Extraction --------------------------------------------------

(defn- get-rhs-field-from-mbql-condition
  "Extract the RHS field ID from an MBQL join condition.
   The RHS field is the one with a :join-alias in its metadata."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts _lhs rhs] condition]
        (when (and (vector? rhs)
                   (= :field (first rhs))
                   (:join-alias (second rhs)))
          ;; Return the field ID (third element for integer refs)
          (let [field-ref (nth rhs 2 nil)]
            (when (int? field-ref) field-ref)))))))

(defn- get-rhs-column-from-ast
  "Extract the RHS column name from a native AST join condition."
  [ast-node]
  (when-let [cond (first (:condition ast-node))]
    (when (= (:type cond) :macaw.ast/binary-expression)
      (let [right (:right cond)]
        (when (= (:type right) :macaw.ast/column)
          (:column right))))))

;;; -------------------------------------------------- Query Building --------------------------------------------------

(defn- find-target-field-by-name
  "Find a field in the target table by name (case-insensitive match)."
  [target field-name]
  (let [normalized (str/lower-case field-name)]
    (some #(when (= (str/lower-case (:name %)) normalized) %)
          (:fields target))))

(defn- find-target-field-by-join-pattern
  "Find a field in the target table matching the joined column pattern: Alias__column."
  [target join-alias column-name]
  (let [pattern (str/lower-case (str join-alias "__" column-name))]
    (some #(when (= (str/lower-case (:name %)) pattern) %)
          (:fields target))))

(defn- make-unmatched-sample-query
  "Query for sample rows from the target table where the RHS join key is NULL.
   These are rows that didn't match in the LEFT JOIN."
  [target-db-id target-table-id rhs-field-id limit]
  (let [mp (lib-be/application-database-metadata-provider target-db-id)
        table-metadata (lib.metadata/table mp target-table-id)
        field-metadata (lib.metadata/field mp rhs-field-id)]
    (-> (lib/query mp table-metadata)
        (lib/filter (lib/is-null (lib/ref field-metadata)))
        (lib/limit limit))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- sample-card-for-join
  "Generate a sample card for unmatched rows of a specific join."
  [ctx step join]
  (let [{:keys [target source-type]} ctx
        {:keys [alias strategy conditions ast-node source-table]} join
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)]
    (when is-outer?
      (let [;; Find the RHS field in target based on source type
            rhs-field-id (case source-type
                           :mbql (get-rhs-field-from-mbql-condition conditions)
                           :native (when-let [col-name (get-rhs-column-from-ast ast-node)]
                                     ;; For native, try to find matching field in target
                                     (or (:id (find-target-field-by-join-pattern target alias col-name))
                                         (:id (find-target-field-by-name target col-name))))
                           nil)]
        (when rhs-field-id
          {:id            (str "unmatched-sample-" step)
           :section-id    "samples"
           :title         (str "Unmatched rows for join: " alias)
           :display       :table
           :dataset-query (make-unmatched-sample-query (:db-id target)
                                                        (:table-id target)
                                                        rhs-field-id
                                                        100)
           :metadata      {:card-type     :unmatched-sample
                           :join-step     step
                           :join-alias    alias
                           :join-strategy strategy
                           :rhs-field-id  rhs-field-id}})))))

(defn- all-cards
  "Generate sample cards for all outer joins, optionally filtered by join-step."
  [ctx params]
  (let [{:keys [join-structure]} ctx
        ;; Parse requested-step to int (may be string from query params)
        requested-step (some-> (:join-step params) str parse-long)]
    (into []
          (keep (fn [[idx join]]
                  (let [step (inc idx)]
                    (when (or (nil? requested-step) (= step requested-step))
                      (sample-card-for-join ctx step join)))))
          (map-indexed vector join-structure))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :unmatched-rows
  [_ ctx]
  ;; Only applicable when we have outer joins
  (and (:has-joins? ctx)
       (some #(contains? #{:left-join :right-join :full-join} (:strategy %))
             (:join-structure ctx))))

(defmethod lens.core/lens-metadata :unmatched-rows
  [_ _ctx]
  {:id           "unmatched-rows"
   :display-name "Unmatched Rows"
   :description  "Sample rows that failed to join"})

(defmethod lens.core/make-lens :unmatched-rows
  [_ ctx params]
  (let [{:keys [join-structure]} ctx
        cards (all-cards ctx params)
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
                     {:text       "No outer joins with detectable RHS fields"
                      :highlights []})
     :sections     [{:id     "samples"
                     :title  "Unmatched Row Samples"
                     :layout :flat}]
     :cards        cards}))

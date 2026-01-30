(ns metabase-enterprise.transforms.inspector.lenses.comparison
  "Column Comparison lens - compare input/output distributions.

   This lens compares distributions of matched columns between
   input and output tables.

   Layout: :comparison (cards grouped by column, inputs left, output right)

   Cards have:
   - :group-id - column name for grouping
   - :group-role - :input or :output
   - :group-order - order within group (inputs first, then output)"
  (:require
   [metabase-enterprise.transforms.inspector.cards :as cards]
   [metabase-enterprise.transforms.inspector.lenses.core :as lenses.core]
   [metabase.lib.transforms.inspector.interestingness :as interestingness]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lenses.core/lens-applicable? :column-comparison
  [_ ctx]
  ;; Applicable when we have matched columns
  ;; In base context (Phase 1): check :has-column-matches?
  ;; In lens context (Phase 2): check (seq :column-matches)
  (or (:has-column-matches? ctx)
      (seq (:column-matches ctx))))

(defmethod lenses.core/lens-metadata :column-comparison
  [_ _ctx]
  {:id           "column-comparison"
   :display-name "Column Distributions"
   :description  "Compare input/output column distributions"})

;;; -------------------------------------------------- Summary --------------------------------------------------

(defn- make-summary
  "Create the summary section."
  [ctx]
  (let [column-matches (:column-matches ctx)
        match-count    (count column-matches)]
    {:text       (str match-count " matched column(s) between input and output")
     :highlights [{:label "Matched Columns" :value match-count}]
     :alerts     []}))

;;; -------------------------------------------------- Sections --------------------------------------------------

(defn- categorize-column
  "Categorize a column for section grouping."
  [field]
  (let [base-type (:base-type field)]
    (cond
      (contains? #{:type/DateTime :type/Date :type/Time
                   :type/DateTimeWithTZ :type/DateTimeWithLocalTZ}
                 base-type)
      :temporal

      (contains? #{:type/Integer :type/Float :type/Decimal :type/Number}
                 base-type)
      :numeric

      (contains? #{:type/Boolean}
                 base-type)
      :boolean

      :else
      :categorical)))

(defn- make-sections
  "Create sections based on column types present in the matches."
  [ctx]
  (let [column-matches (:column-matches ctx)
        categories     (into #{} (map #(categorize-column (:output-field %))) column-matches)]
    (cond-> []
      (contains? categories :temporal)
      (conj {:id          "temporal"
             :title       "Temporal Columns"
             :description "Date and time columns"})

      (contains? categories :numeric)
      (conj {:id          "numeric"
             :title       "Numeric Columns"
             :description "Number columns"})

      (contains? categories :categorical)
      (conj {:id          "categorical"
             :title       "Categorical Columns"
             :description "Text and category columns"})

      (contains? categories :boolean)
      (conj {:id          "boolean"
             :title       "Boolean Columns"
             :description "True/false columns"}))))

;;; -------------------------------------------------- Lens Definition --------------------------------------------------

(defmethod lenses.core/make-lens-definition :column-comparison
  [_ ctx]
  {:id                  "column-comparison"
   :display-name        "Column Distributions"
   :layout              :comparison
   :summary             (make-summary ctx)
   :sections            (make-sections ctx)
   :drill-lenses        []
   :alert-triggers      []
   :drill-lens-triggers []})

;;; -------------------------------------------------- Card Generation Helpers --------------------------------------------------

(defn- column-to-section-id
  "Map a column to its section ID based on type."
  [field]
  (name (categorize-column field)))

(defn- score-column-match
  "Score a column match for interestingness.
   Uses the output field's interestingness."
  [{:keys [output-field]}]
  (let [result (interestingness/score-field output-field)]
    (:score result)))

(defn- filter-interesting-matches
  "Filter column matches to only interesting ones."
  [column-matches threshold]
  (->> column-matches
       (map #(assoc % :interestingness (score-column-match %)))
       (filter #(> (:interestingness %) threshold))
       (sort-by :interestingness >)))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- make-comparison-cards-for-match
  "Create comparison cards for a single column match.
   Returns all cards flattened (main + stats cards)."
  [sources target source-table-id {:keys [output-column output-field input-columns interestingness]}]
  (let [db-id      (:db-id (first sources))
        section-id (column-to-section-id output-field)
        ;; Sort inputs so source table comes first
        sorted-inputs (sort-by #(if (= (:table-id %) source-table-id) 0 1) input-columns)
        ;; Helper to add interestingness to main card (first of pair)
        add-interestingness (fn [cards]
                              (when cards
                                (let [[main-card stats-card] cards]
                                  [(assoc main-card :interestingness interestingness)
                                   stats-card])))]
    (->> (concat
          ;; Input cards (each distribution-card returns [main, stats] or nil)
          (keep
           (fn [[idx {:keys [table-id table-name field]}]]
             (add-interestingness
              (cards/distribution-card db-id table-id table-name field
                                       :section-id section-id
                                       :group-id output-column
                                       :group-role :input
                                       :group-order idx
                                       :summary true)))
           (map-indexed vector sorted-inputs))
          ;; Output card
          (when (:id output-field)
            [(add-interestingness
              (cards/distribution-card db-id (:table-id target) (:table-name target)
                                       output-field
                                       :section-id section-id
                                       :group-id output-column
                                       :group-role :output
                                       :group-order 0
                                       :summary true))]))
         (keep identity)
         (apply concat))))

(defn- get-source-table-id
  "Get the source table ID from join structure or first source."
  [ctx]
  (or (some-> ctx :join-structure first :source-table)
      (some-> ctx :sources first :table-id)))

(defmethod lenses.core/generate-cards :column-comparison
  [_ ctx]
  (let [column-matches   (:column-matches ctx)
        sources          (:sources ctx)
        target           (:target ctx)
        source-table-id  (get-source-table-id ctx)
        interesting      (filter-interesting-matches column-matches 0.3)]
    (vec (mapcat (partial make-comparison-cards-for-match sources target source-table-id)
                 interesting))))

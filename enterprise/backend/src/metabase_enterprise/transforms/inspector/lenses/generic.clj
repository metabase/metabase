(ns metabase-enterprise.transforms.inspector.lenses.generic
  "Generic Summary lens - overview stats for any transform.

   This lens is always applicable and provides:
   - Row count cards for input and output tables
   - Column type breakdown
   - Top N interesting column distributions

   Layout: :flat (cards in grid layout)"
  (:require
   [metabase-enterprise.transforms.inspector.cards :as cards]
   [metabase-enterprise.transforms.inspector.lenses.core :as lenses.core]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lenses.core/lens-applicable? :generic-summary
  [_ _ctx]
  ;; Generic summary is always applicable
  true)

(defmethod lenses.core/lens-metadata :generic-summary
  [_ _ctx]
  {:id           "generic-summary"
   :display-name "Data Summary"
   :description  "Overview of input and output tables"})

;;; -------------------------------------------------- Summary --------------------------------------------------

(defn- make-summary
  "Create the summary section with highlights.
   Values are nil initially - populated after card execution via feedback."
  [ctx]
  (let [sources (:sources ctx)
        target  (:target ctx)]
    {:text       (str "Transform with " (count sources) " input table(s)")
     :highlights (cond-> []
                   ;; Input table count
                   (seq sources)
                   (conj {:label "Input Tables" :value (count sources)})

                   ;; Output column count (known statically)
                   target
                   (conj {:label "Output Columns"
                          :value (:column-count target)}))
     :alerts     []}))  ; Will be populated via feedback

;;; -------------------------------------------------- Sections --------------------------------------------------

(defn- make-sections
  "Create sections for the generic summary lens."
  []
  [{:id          "overview"
    :title       "Overview"
    :description "Table statistics"}
   {:id          "input-distributions"
    :title       "Input Distributions"
    :description "Distribution of values in input tables"}
   {:id          "output-distributions"
    :title       "Output Distributions"
    :description "Distribution of values in output table"}])

;;; -------------------------------------------------- Lens Definition --------------------------------------------------

(defmethod lenses.core/make-lens-definition :generic-summary
  [_ ctx]
  {:id                  "generic-summary"
   :display-name        "Data Summary"
   :layout              :flat
   :summary             (make-summary ctx)
   :sections            (make-sections)
   :drill-lenses        []  ; No drill-lenses for generic summary
   :alert-triggers      []  ; No alerts for generic summary
   :drill-lens-triggers []})

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- make-overview-cards
  "Create row count cards for overview section."
  [ctx]
  (let [sources (:sources ctx)
        target  (:target ctx)]
    (concat
     ;; Input table row counts
     (mapv (fn [{:keys [table-id table-name db-id]}]
             (cards/row-count-card db-id table-id table-name "overview"))
           sources)
     ;; Output table row count
     (when target
       [(cards/row-count-card (:db-id target) (:table-id target)
                              (:table-name target) "overview")]))))

(defn- make-distribution-cards
  "Create distribution cards for interesting fields."
  [ctx]
  (let [sources (:sources ctx)
        target  (:target ctx)]
    (concat
     ;; Input distributions
     (mapcat (fn [{:keys [table-id table-name db-id fields]}]
               (cards/interesting-distribution-cards
                db-id table-id table-name fields
                :section-id "input-distributions"
                :threshold 0.3
                :limit 5))
             sources)
     ;; Output distributions
     (when target
       (cards/interesting-distribution-cards
        (:db-id target) (:table-id target) (:table-name target) (:fields target)
        :section-id "output-distributions"
        :threshold 0.3
        :limit 5)))))

(defmethod lenses.core/generate-cards :generic-summary
  [_ ctx]
  (vec (concat (make-overview-cards ctx)
               (make-distribution-cards ctx))))

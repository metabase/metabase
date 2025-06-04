(ns metabase.visualizer.compat
  "Cross-platform visualizer compatibility checking for Metabase.
   This is a proof of concept implementation focusing on cartesian charts."
  (:require
   [metabase.lib.types.constants :as lib.types.constants]
   [metabase.util.malli :as mu]))

;;; -------------------------------------------------- Type Predicates --------------------------------------------------

(defn- dimension?
  "Check if a field is a dimension (not a metric)."
  [field]
  (and (not= (:semantic_type field) :type/PK)
       (or (isa? (:base_type field) :type/Text)
           (isa? (:base_type field) :type/DateTime)
           (isa? (:base_type field) :type/Boolean)
           (isa? (:base_type field) :type/Category))))

(defn- metric?
  "Check if a field is a metric (numeric, can be aggregated)."
  [field]
  (and (isa? (:base_type field) :type/Number)
       (not= (:semantic_type field) :type/PK)))

(defn- temporal?
  "Check if a field is temporal (date/time)."
  [field]
  (isa? (:base_type field) :type/DateTime))

;;; -------------------------------------------------- Compatibility Logic --------------------------------------------------

(defn- check-dimension-compatibility-cartesian
  "Check if dimensions between current and target datasets are compatible for cartesian charts."
  [current-columns target-fields]
  (let [current-dimensions (filter dimension? current-columns)
        target-dimensions  (filter dimension? target-fields)]
    (cond
      ;; If current has no dimensions, can't add more data
      (empty? current-dimensions)
      false

      ;; If current has temporal dimensions, target must too
      (some temporal? current-dimensions)
      (some temporal? target-dimensions)

      ;; Otherwise compatible
      :else
      true)))

(defn- find-slot-for-column-cartesian
  "Find which slot a column can occupy in a cartesian chart.
   Returns :metrics, :dimensions, or nil."
  [column current-settings]
  (cond
    ;; Metrics always go to Y-axis
    (metric? column)
    :metrics

    ;; Dimensions go to X-axis if slot is available
    (and (dimension? column)
         (empty? (:dimensions current-settings)))
    :dimensions

    ;; Dimensions can be added if compatible
    (dimension? column)
    :dimensions

    :else
    nil))

;;; -------------------------------------------------- Public API --------------------------------------------------

(mu/defn compatible? :- :boolean
  "Check if a target dataset is compatible with the current visualization.
   This is a simplified proof of concept focusing on cartesian charts."
  [{:keys [current-display current-columns current-settings target-fields]}
   :- [:map
       [:current-display [:maybe [:enum "bar" "line" "area" "scatter"]]]
       [:current-columns [:sequential :map]]
       [:current-settings :map]
       [:target-fields [:sequential :map]]]]
  (cond
    ;; No fields means not compatible
    (empty? target-fields)
    false

    ;; No display type means accept anything
    (nil? current-display)
    true

    ;; For cartesian charts, check dimension compatibility
    (contains? #{"bar" "line" "area" "scatter"} current-display)
    (and (check-dimension-compatibility-cartesian current-columns target-fields)
         ;; At least one field must be mappable
         (some #(find-slot-for-column-cartesian % current-settings) target-fields))

    ;; Other chart types not supported in PoC
    :else
    false))

(mu/defn find-compatible-columns :- [:map-of :keyword [:sequential :map]]
  "Find which columns from target dataset are compatible with current visualization.
   Returns a map of slot -> columns that can go in that slot."
  [{:keys [current-display current-columns current-settings target-fields]}
   :- [:map
       [:current-display [:maybe [:enum "bar" "line" "area" "scatter"]]]
       [:current-columns [:sequential :map]]
       [:current-settings :map]
       [:target-fields [:sequential :map]]]]
  (if (and current-display
           (contains? #{"bar" "line" "area" "scatter"} current-display)
           (check-dimension-compatibility-cartesian current-columns target-fields))
    (reduce (fn [acc field]
              (if-let [slot (find-slot-for-column-cartesian field current-settings)]
                (update acc slot (fnil conj []) field)
                acc))
            {}
            target-fields)
    {}))
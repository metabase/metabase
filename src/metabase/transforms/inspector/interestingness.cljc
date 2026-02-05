(ns metabase.transforms.inspector.interestingness
  "Column scoring for visualization worthiness.
   Determines which columns are interesting to display in inspector cards.

   This is a cljc namespace so it can be used by both:
   - Backend: to score columns when generating cards
   - Frontend: to filter/sort cards client-side

   Scoring criteria:
   - Dominated columns (PK, FK, UUID) get score 0.0
   - High cardinality columns (>1000 distinct values) get low scores
   - Mostly null columns (>90% null) get low scores
   - Temporal, categorical, and numeric columns with variance get high scores")

(def ^:private dominated-semantic-types
  "Semantic types that are never interesting to visualize."
  #{:type/PK :type/FK :type/UUID :type/SerializedJSON})

(def ^:private high-interest-semantic-types
  "Semantic types that are typically interesting to visualize."
  #{:type/Category :type/State :type/Country :type/City
    :type/CreationTimestamp :type/UpdatedTimestamp
    :type/CreationDate :type/UpdatedDate
    :type/Price :type/Cost :type/Quantity :type/Score
    :type/Percentage :type/Duration})

(def ^:private temporal-base-types
  "Base types that represent temporal data."
  #{:type/DateTime :type/Date :type/Time
    :type/DateTimeWithTZ :type/DateTimeWithLocalTZ
    :type/DateTimeWithZoneID :type/DateTimeWithZoneOffset})

(defn dominated-column?
  "Returns true if the column should never be visualized.
   These are structural columns (PKs, FKs, UUIDs) that don't provide
   meaningful distribution insights."
  [field]
  (let [semantic-type (:semantic_type field)
        field-name    (some-> (:name field) str)]
    (or
     ;; Explicit semantic type indicates dominated column
     (contains? dominated-semantic-types semantic-type)
     ;; Name pattern matching for common ID columns
     (and field-name
          (re-matches #"(?i).*_id$|^id$|.*_uuid$|^uuid$" field-name)))))

(defn- high-cardinality?
  "Returns true if the column has very high cardinality (>1000 distinct values).
   High cardinality columns don't make good bar/pie charts."
  [field]
  (let [distinct-count (get-in field [:stats :distinct_count])]
    (and distinct-count (> distinct-count 1000))))

(defn- mostly-null?
  "Returns true if the column is mostly null (>90% null)."
  [field]
  (let [nil-percent (get-in field [:stats :nil_percent])]
    (and nil-percent (> nil-percent 0.9))))

(defn- temporal-column?
  "Returns true if the column represents temporal data."
  [field]
  (or (contains? temporal-base-types (:base_type field))
      (contains? #{:type/CreationTimestamp :type/UpdatedTimestamp
                   :type/CreationDate :type/UpdatedDate}
                 (:semantic_type field))))

(defn- categorical-column?
  "Returns true if the column appears to be categorical (low cardinality text/enum)."
  [field]
  (let [distinct-count (get-in field [:stats :distinct_count])
        base-type      (:base_type field)]
    (and distinct-count
         (<= distinct-count 20)
         (contains? #{:type/Text :type/TextLike} base-type))))

(defn- numeric-with-variance?
  "Returns true if the column is numeric and has meaningful variance."
  [field]
  (let [base-type (:base_type field)
        min-val   (get-in field [:stats :min])
        max-val   (get-in field [:stats :max])]
    (and (contains? #{:type/Integer :type/Float :type/Decimal :type/Number} base-type)
         min-val max-val
         (not= min-val max-val))))

(defn score-field
  "Score a field from 0.0 to 1.0 for visualization worthiness.
   Higher scores indicate more interesting columns.

   Returns a map with:
   - :score       - numeric score 0.0-1.0
   - :dominated?  - true if column should never be shown
   - :reasons     - vector of keywords explaining the score"
  [field]
  (cond
    ;; Dominated columns - never show
    (dominated-column? field)
    {:score 0.0 :dominated? true :reasons [:dominated-column]}

    ;; Mostly null - rarely useful
    (mostly-null? field)
    {:score 0.1 :dominated? false :reasons [:mostly-null]}

    ;; High cardinality without semantic type - poor for visualization
    (and (high-cardinality? field)
         (not (contains? high-interest-semantic-types (:semantic_type field))))
    {:score 0.2 :dominated? false :reasons [:high-cardinality]}

    :else
    (let [reasons   (cond-> []
                      (temporal-column? field)       (conj :temporal)
                      (categorical-column? field)    (conj :categorical)
                      (numeric-with-variance? field) (conj :numeric-variance)
                      (contains? high-interest-semantic-types (:semantic_type field))
                      (conj :high-interest-semantic-type))
          base-score (cond
                       (temporal-column? field)                              0.9
                       (contains? high-interest-semantic-types
                                  (:semantic_type field))                    0.85
                       (categorical-column? field)                           0.8
                       (numeric-with-variance? field)                        0.75
                       :else                                                 0.5)]
      {:score      base-score
       :dominated? false
       :reasons    (if (seq reasons) reasons [:default])})))

(defn interesting-fields
  "Filter and sort fields by interestingness.
   Returns fields with score above threshold, sorted by score descending.

   Options:
   - :threshold - minimum score to include (default 0.3)
   - :limit     - maximum number of fields to return (default nil = all)"
  [fields & {:keys [threshold limit] :or {threshold 0.3}}]
  (let [scored (->> fields
                    (map #(assoc % :interestingness (score-field %)))
                    (remove #(get-in % [:interestingness :dominated?]))
                    (filter #(> (get-in % [:interestingness :score]) threshold))
                    (sort-by #(get-in % [:interestingness :score]) >))]
    (if limit
      (take limit scored)
      scored)))

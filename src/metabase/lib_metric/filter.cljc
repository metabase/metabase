(ns metabase.lib-metric.filter
  "Functions for computing filterable dimensions with filter positions and operators."
  (:require
   [metabase.lib-metric.definition :as definition]
   [metabase.lib-metric.dimension :as dimension]
   [metabase.lib-metric.types.isa :as types.isa]
   [metabase.lib.options :as lib.options]
   [metabase.util.performance :as perf]))

(defn leading-dimension-ref
  "Extract the dimension UUID from a filter clause's leading argument.
   Filter clauses look like: [:operator opts [:dimension opts uuid] value ...]
   Compound filters (:and, :or, :not) don't have a leading dimension ref.
   Returns the UUID string or nil."
  [filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)
          third    (nth filter-clause 2 nil)]
      (when-not (#{:and :or :not} operator)
        (when (and (vector? third)
                   (= :dimension (first third))
                   (>= (count third) 3))
          (nth third 2))))))

(defn build-filter-positions
  "Build a map of {dimension-id -> [filter-indices]} from a sequence of filters.
   Each dimension ID maps to a vector of zero-based indices where it appears."
  [filters]
  (reduce-kv
   (fn [acc idx filter-clause]
     (if-let [dim-id (leading-dimension-ref filter-clause)]
       (update acc dim-id (fnil conj []) idx)
       acc))
   {}
   (vec filters)))

;;; -------------------------------------------------- Filter Operators --------------------------------------------------

(def ^:private default-operators
  "Default operators available for all column types."
  [:is-null :not-null])

(def ^:private string-operators
  "String filter operators. Note: FE uses :is-empty/:not-empty instead of :is-null/:not-null for strings."
  [:is-empty :not-empty := :!= :contains :does-not-contain :starts-with :ends-with])

(def ^:private number-operators
  "Numeric filter operators."
  [:is-null :not-null := :!= :> :>= :< :<= :between])

(def ^:private boolean-operators
  "Boolean filter operators. Note: :!= is not supported."
  [:is-null :not-null :=])

(def ^:private temporal-operators
  "Date/datetime filter operators."
  [:is-null :not-null := :!= :> :< :between])

(def ^:private coordinate-operators
  "Coordinate filter operators. Note: :is-null/:not-null not supported for coordinates."
  [:= :!= :> :>= :< :<= :between :inside])

(def ^:private time-operators
  "Time-only filter operators."
  [:is-null :not-null :> :< :between])

(defn operators-for-dimension
  "Get available filter operators for a dimension based on its type.
   Returns a vector of operator keywords.
   Type checking follows the same hierarchy as metabase.lib, applied to dimension metadata."
  [dimension]
  (cond
    (types.isa/string-or-string-like? dimension) string-operators
    (types.isa/coordinate? dimension)            coordinate-operators
    (types.isa/boolean? dimension)               boolean-operators
    (types.isa/time? dimension)                  time-operators
    (types.isa/temporal? dimension)              temporal-operators
    (types.isa/numeric? dimension)               number-operators
    :else                                        default-operators))

(defn filterable-dimension-operators
  "Get available filter operators for a dimension.
   Returns a vector of operator keywords directly (e.g., [:= :!= :contains ...]).
   Unlike metabase.lib which wraps operators in maps, this returns simple keywords."
  [dimension]
  (operators-for-dimension dimension))

;;; -------------------------------------------------- Filterable Dimensions --------------------------------------------------

(defn filterable-dimensions
  "Get dimensions that can be used for filtering, with :filter-positions attached.
   Each dimension will have a :filter-positions key containing a vector of indices
   where that dimension is used in the definition's filters."
  [definition]
  (let [provider    (:metadata-provider definition)
        source-type (get-in definition [:source :type])
        source-id   (get-in definition [:source :id])
        dimensions  (case source-type
                      :source/metric  (dimension/dimensions-for-metric provider source-id)
                      :source/measure (dimension/dimensions-for-measure provider source-id)
                      [])
        filters     (definition/filters definition)
        positions   (build-filter-positions filters)]
    (perf/mapv
     (fn [dim]
       (assoc dim
              :filter-positions (get positions (:id dim) [])
              :operators (operators-for-dimension dim)))
     dimensions)))

;;; -------------------------------------------------- Add Filter --------------------------------------------------

(defn add-filter
  "Add a filter clause to a metric definition.
   Returns a new definition with the filter added to the :filters vector."
  [definition filter-clause]
  (update definition :filters (fnil conj []) filter-clause))

;;; -------------------------------------------------- Filter Clause Helpers --------------------------------------------------

(defn- dimension-ref
  "Create a dimension reference from a dimension.
   Returns [:dimension {} dimension-id]."
  [dimension]
  [:dimension {} (:id dimension)])

(defn- find-dimension-by-id
  "Find a dimension in the definition by its ID."
  [definition dimension-id]
  (let [dimensions (filterable-dimensions definition)]
    (some #(when (= (:id %) dimension-id) %) dimensions)))

;;; -------------------------------------------------- Default Filters (is-null/not-null) --------------------------------------------------

(defn default-filter-clause
  "Create a default filter clause (is-null or not-null) from parts.
   Parts: {:operator :is-null/:not-null, :dimension dimension}"
  [{:keys [operator dimension]}]
  (lib.options/ensure-uuid [operator {} (dimension-ref dimension)]))

(defn default-filter-parts
  "Extract default filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension} or nil if not a default filter."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:is-null :not-null} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            {:operator  operator
             :dimension dimension}))))))

;;; -------------------------------------------------- Boolean Filters --------------------------------------------------

(defn boolean-filter-clause
  "Create a boolean filter clause from parts.
   Parts: {:operator := or :is-null/:not-null, :dimension dimension, :values [boolean]}"
  [{:keys [operator dimension values]}]
  (lib.options/ensure-uuid
   (case operator
     (:is-null :not-null) [operator {} (dimension-ref dimension)]
     := [:= {} (dimension-ref dimension) (first values)])))

(defn boolean-filter-parts
  "Extract boolean filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :values [boolean]} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:= :is-null :not-null} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            ;; Check if this is actually a boolean filter by looking at dimension type
            (when (types.isa/boolean? dimension)
              (case operator
                (:is-null :not-null) {:operator  operator
                                      :dimension dimension
                                      :values    []}
                := (let [value (nth filter-clause 3 nil)]
                     (when (boolean? value)
                       {:operator  operator
                        :dimension dimension
                        :values    [value]}))))))))))

;;; -------------------------------------------------- Number Filters --------------------------------------------------

(defn number-filter-clause
  "Create a number filter clause from parts.
   Parts: {:operator :keyword, :dimension dimension, :values [number]}"
  [{:keys [operator dimension values]}]
  (lib.options/ensure-uuid
   (case operator
     (:is-null :not-null) [operator {} (dimension-ref dimension)]
     :between             [:between {} (dimension-ref dimension) (first values) (second values)]
     ;; Standard comparison operators: =, !=, >, >=, <, <=
     (into [operator {} (dimension-ref dimension)] values))))

(defn number-filter-parts
  "Extract number filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :values [number]} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:= :!= :> :>= :< :<= :between :is-null :not-null} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            ;; Check if this is actually a number filter by looking at dimension type
            ;; Exclude coordinate dimensions - they should use coordinate-filter-parts
            (when (and (types.isa/numeric? dimension)
                       (not (types.isa/coordinate? dimension)))
              (case operator
                (:is-null :not-null) {:operator  operator
                                      :dimension dimension
                                      :values    []}
                :between             {:operator  operator
                                      :dimension dimension
                                      :values    [(nth filter-clause 3) (nth filter-clause 4)]}
                ;; Standard operators with values in positions 3+
                {:operator  operator
                 :dimension dimension
                 :values    (vec (drop 3 filter-clause))}))))))))

;;; -------------------------------------------------- String Filters --------------------------------------------------

(defn string-filter-clause
  "Create a string filter clause from parts.
   Parts: {:operator :keyword, :dimension dimension, :values [string], :options map}"
  [{:keys [operator dimension values options]}]
  (lib.options/ensure-uuid
   (case operator
     (:is-empty :not-empty) [operator {} (dimension-ref dimension)]
     ;; Operators that take a single value and may have options
     (:contains :does-not-contain :starts-with :ends-with)
     (if (seq options)
       [operator options (dimension-ref dimension) (first values)]
       [operator {} (dimension-ref dimension) (first values)])
     ;; Equality operators can have multiple values
     (:= :!=) (into [operator {} (dimension-ref dimension)] values))))

(defn string-filter-parts
  "Extract string filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :values [string], :options map} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:= :!= :contains :does-not-contain :starts-with :ends-with :is-empty :not-empty} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            ;; Check if this is actually a string filter by looking at dimension type
            (when (types.isa/string-or-string-like? dimension)
              (case operator
                (:is-empty :not-empty) {:operator  operator
                                        :dimension dimension
                                        :values    []
                                        :options   {}}
                (:contains :does-not-contain :starts-with :ends-with)
                (let [opts   (second filter-clause)
                      ;; Filter out :lib/uuid from options
                      clean-opts (dissoc opts :lib/uuid)]
                  {:operator  operator
                   :dimension dimension
                   :values    [(nth filter-clause 3)]
                   :options   clean-opts})
                ;; Equality operators
                {:operator  operator
                 :dimension dimension
                 :values    (vec (drop 3 filter-clause))
                 :options   {}}))))))))

;;; -------------------------------------------------- Coordinate Filters --------------------------------------------------

(defn coordinate-filter-clause
  "Create a coordinate filter clause from parts.
   Parts: {:operator :keyword, :dimension lat-dimension, :longitude-dimension lon-dimension, :values [number]}"
  [{:keys [operator dimension longitude-dimension values]}]
  (lib.options/ensure-uuid
   (case operator
     :inside [:inside {}
              (dimension-ref dimension)
              (dimension-ref longitude-dimension)
              (nth values 0) (nth values 1) (nth values 2) (nth values 3)]
     :between [:between {} (dimension-ref dimension) (first values) (second values)]
     ;; Standard operators
     (into [operator {} (dimension-ref dimension)] values))))

(defn coordinate-filter-parts
  "Extract coordinate filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :longitude-dimension dimension, :values [number]} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:= :!= :> :>= :< :<= :between :inside} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            ;; Check if this is actually a coordinate filter by looking at dimension type
            (when (types.isa/coordinate? dimension)
              (case operator
                :inside (let [lon-ref (nth filter-clause 3 nil)
                              lon-id  (when (and (vector? lon-ref) (= :dimension (first lon-ref)))
                                        (nth lon-ref 2 nil))
                              lon-dim (when lon-id (find-dimension-by-id definition lon-id))]
                          {:operator            operator
                           :dimension           dimension
                           :longitude-dimension lon-dim
                           :values              [(nth filter-clause 4)
                                                 (nth filter-clause 5)
                                                 (nth filter-clause 6)
                                                 (nth filter-clause 7)]})
                :between {:operator            operator
                          :dimension           dimension
                          :longitude-dimension nil
                          :values              [(nth filter-clause 3) (nth filter-clause 4)]}
                ;; Standard operators
                {:operator            operator
                 :dimension           dimension
                 :longitude-dimension nil
                 :values              (vec (drop 3 filter-clause))}))))))))

;;; -------------------------------------------------- Specific Date Filters --------------------------------------------------

(defn specific-date-filter-clause
  "Create a specific date filter clause from parts.
   Parts: {:operator :keyword, :dimension dimension, :values [date-string], :has-time boolean}"
  [{:keys [operator dimension values]}]
  (lib.options/ensure-uuid
   (case operator
     :between [:between {} (dimension-ref dimension) (first values) (second values)]
     ;; Standard operators: =, >, <
     [operator {} (dimension-ref dimension) (first values)])))

(defn- value-has-time?
  "Check if a date value includes a time component.
   Handles both string values (ISO 8601 format) and JS Date objects.
   For Date objects, uses UTC methods to avoid timezone issues."
  [v]
  (cond
    ;; String: check for ISO 8601 time marker or HH:MM pattern
    (string? v)
    (boolean (or (re-find #"T" v)
                 (re-find #"\d{2}:\d{2}" v)))

    ;; JS Date object: check if any UTC time components are non-zero
    ;; Using UTC methods to avoid timezone issues with midnight dates
    #?(:cljs (instance? js/Date v)
       :clj  (instance? java.util.Date v))
    (let [hours   #?(:cljs (.getUTCHours v)   :clj (.getHours v))
          minutes #?(:cljs (.getUTCMinutes v) :clj (.getMinutes v))
          seconds #?(:cljs (.getUTCSeconds v) :clj (.getSeconds v))]
      (or (pos? hours) (pos? minutes) (pos? seconds)))

    :else false))

(defn specific-date-filter-parts
  "Extract specific date filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :values [date], :has-time boolean} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:= :> :< :between} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            ;; Check if this is a temporal (but not time-only) filter
            (when (and (types.isa/temporal? dimension)
                       (not (types.isa/time? dimension)))
              (let [values (case operator
                             :between [(nth filter-clause 3) (nth filter-clause 4)]
                             [(nth filter-clause 3)])
                    ;; Determine if values include time component
                    has-time (some value-has-time? values)]
                {:operator  operator
                 :dimension dimension
                 :values    values
                 :has-time  (boolean has-time)}))))))))

;;; -------------------------------------------------- Relative Date Filters --------------------------------------------------

(defn relative-date-filter-clause
  "Create a relative date filter clause from parts.
   Parts: {:dimension dimension, :unit :day/:week/etc, :value int, :offset-unit unit, :offset-value int, :options map}"
  [{:keys [dimension unit value offset-unit offset-value options]}]
  (let [base-options (cond-> {}
                       (seq options) (merge options)
                       offset-unit   (assoc :offset-unit offset-unit)
                       offset-value  (assoc :offset-value offset-value))]
    (lib.options/ensure-uuid
     (if (seq base-options)
       [:time-interval base-options (dimension-ref dimension) value unit]
       [:time-interval {} (dimension-ref dimension) value unit]))))

(defn relative-date-filter-parts
  "Extract relative date filter parts from an MBQL clause.
   Returns {:dimension dim, :unit unit, :value int, :offset-unit unit, :offset-value int, :options map} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (= :time-interval (first filter-clause))
             (>= (count filter-clause) 5))
    (when-let [dim-id (leading-dimension-ref filter-clause)]
      (when-let [dimension (find-dimension-by-id definition dim-id)]
        (let [opts         (second filter-clause)
              value        (nth filter-clause 3)
              unit         (nth filter-clause 4)
              offset-unit  (:offset-unit opts)
              offset-value (:offset-value opts)
              ;; Remove internal keys from options
              clean-opts   (dissoc opts :lib/uuid :offset-unit :offset-value)]
          {:dimension    dimension
           :unit         unit
           :value        value
           :offset-unit  offset-unit
           :offset-value offset-value
           :options      clean-opts})))))

;;; -------------------------------------------------- Exclude Date Filters --------------------------------------------------

(defn exclude-date-filter-clause
  "Create an exclude date filter clause from parts.
   Parts: {:operator :keyword, :dimension dimension, :unit :day-of-week/etc, :values [int]}"
  [{:keys [operator dimension unit values]}]
  (lib.options/ensure-uuid
   (case operator
     (:is-null :not-null) [operator {} (dimension-ref dimension)]
     ;; For :!= with unit, we need to wrap the dimension in a temporal extraction
     :!= (let [extraction-fn (case unit
                               :day-of-week :get-day-of-week
                               :month-of-year :get-month
                               :quarter-of-year :get-quarter
                               :hour-of-day :get-hour
                               ;; Default
                               :get-day-of-week)]
           (into [:!= {} [extraction-fn {} (dimension-ref dimension)]] values)))))

(defn exclude-date-filter-parts
  "Extract exclude date filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :unit unit, :values [int]} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (cond
        ;; Null checks
        (#{:is-null :not-null} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            (when (types.isa/temporal? dimension)
              {:operator  operator
               :dimension dimension
               :unit      nil
               :values    []})))

        ;; Exclude with temporal extraction
        (= :!= operator)
        (let [third (nth filter-clause 2 nil)]
          (when (and (vector? third)
                     (#{:get-day-of-week :get-month :get-quarter :get-hour} (first third)))
            (let [extraction-fn (first third)
                  dim-ref       (nth third 2 nil)
                  dim-id        (when (and (vector? dim-ref) (= :dimension (first dim-ref)))
                                  (nth dim-ref 2 nil))]
              (when-let [dimension (when dim-id (find-dimension-by-id definition dim-id))]
                (let [unit (case extraction-fn
                             :get-day-of-week :day-of-week
                             :get-month :month-of-year
                             :get-quarter :quarter-of-year
                             :get-hour :hour-of-day
                             nil)]
                  {:operator  operator
                   :dimension dimension
                   :unit      unit
                   :values    (vec (drop 3 filter-clause))})))))))))

;;; -------------------------------------------------- Time Filters --------------------------------------------------

(defn time-filter-clause
  "Create a time filter clause from parts.
   Parts: {:operator :keyword, :dimension dimension, :values [time-string]}"
  [{:keys [operator dimension values]}]
  (lib.options/ensure-uuid
   (case operator
     (:is-null :not-null) [operator {} (dimension-ref dimension)]
     :between             [:between {} (dimension-ref dimension) (first values) (second values)]
     ;; Standard operators: >, <
     [operator {} (dimension-ref dimension) (first values)])))

(defn time-filter-parts
  "Extract time filter parts from an MBQL clause.
   Returns {:operator :keyword, :dimension dimension, :values [time]} or nil."
  [definition filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)]
      (when (#{:> :< :between :is-null :not-null} operator)
        (when-let [dim-id (leading-dimension-ref filter-clause)]
          (when-let [dimension (find-dimension-by-id definition dim-id)]
            ;; Check if this is specifically a time filter (not date/datetime)
            (when (types.isa/time? dimension)
              (case operator
                (:is-null :not-null) {:operator  operator
                                      :dimension dimension
                                      :values    []}
                :between             {:operator  operator
                                      :dimension dimension
                                      :values    [(nth filter-clause 3) (nth filter-clause 4)]}
                {:operator  operator
                 :dimension dimension
                 :values    [(nth filter-clause 3)]}))))))))

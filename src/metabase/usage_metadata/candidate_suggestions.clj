(ns metabase.usage-metadata.candidate-suggestions
  "Deterministic human-facing names, descriptions, and predicate presentation for mined candidates."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]))

(set! *warn-on-reflection* true)

(def candidate-name-max-length
  "Maximum length accepted by persisted entity names."
  254)

(defn safe-display-name
  "Return Lib's long display name, or `fallback` when naming fails."
  [definition clause fallback]
  (try
    (or (not-empty (lib/display-name definition 0 clause :long))
        fallback)
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to generate candidate display name")
      fallback)))

(defn safe-definition-description
  "Return Lib's top-level description, or `fallback` when description generation fails."
  [definition top-level-key fallback]
  (try
    (or (lib/describe-top-level-key definition top-level-key)
        fallback)
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to generate candidate definition description")
      fallback)))

(def ^:private candidate-name-max-inline-values
  3)

(defn- literal-display-name
  [value]
  (cond
    (string? value) value
    (keyword? value) (name value)
    (nil? value) (trs "empty")
    :else (str value)))

(defn- detailed-multi-value-filter-name
  [definition [operator _opts field & values]]
  (when (and (contains? #{:= :in :!= :not-in} operator)
             (> (count values) 1)
             (every? #(or (string? %)
                          (number? %)
                          (boolean? %)
                          (keyword? %)
                          (nil? %))
                     values))
    (let [field-name     (safe-display-name definition field (trs "Field"))
          visible-values (take candidate-name-max-inline-values values)
          remaining      (- (count values) (count visible-values))
          value-names    (cond-> (mapv literal-display-name visible-values)
                           (pos? remaining) (conj (trs "{0} more" remaining)))
          joined-values  (i18n/join-strings-with-conjunction (trs "or") value-names)]
      (if (contains? #{:= :in} operator)
        (trs "{0} is one of {1}" field-name joined-values)
        (trs "{0} excludes {1}" field-name joined-values)))))

(defn- detailed-candidate-display-name
  [definition clause fallback]
  (or (detailed-multi-value-filter-name definition clause)
      (when (and (vector? clause)
                 (contains? #{:and :or} (first clause)))
        (let [[operator _opts & subclauses] clause
              names (mapv #(detailed-candidate-display-name definition % fallback)
                          subclauses)]
          (i18n/join-strings-with-conjunction
           (if (= operator :and) (trs "and") (trs "or"))
           names)))
      (safe-display-name definition clause fallback)))

(defn- conjunction-atoms
  [[operator _opts & subclauses :as predicate]]
  (if (= operator :and)
    (mapcat conjunction-atoms subclauses)
    [predicate]))

(defn column-predicate-kind
  "Classify a Lib column into the stable predicate-color categories used by Cleanup."
  [column]
  (cond
    (lib.types.isa/boolean? column) :boolean
    (lib.types.isa/temporal? column) :temporal
    (or (lib.types.isa/category? column)
        (lib.types.isa/string-or-string-like? column)
        (lib.types.isa/foreign-key? column)
        (lib.types.isa/primary-key? column)) :category
    (lib.types.isa/numeric? column) :number
    :else :other))

(defn- atom-predicate-kind
  [definition atom]
  (try
    (let [field-ids (lib/all-field-ids atom)
          columns   (mapv #(lib.metadata/field definition %) field-ids)
          kinds     (into #{} (map column-predicate-kind) columns)]
      (if (and (seq field-ids)
               (every? some? columns)
               (= 1 (count kinds)))
        (first kinds)
        :other))
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to determine candidate predicate kind")
      :other)))

(defn- candidate-atom-details
  [definition predicate]
  (->> (conjunction-atoms predicate)
       (sort-by candidate-mining/canonical-signature)
       (mapv (fn [atom]
               {:signature    (candidate-mining/canonical-signature atom)
                :display-name (detailed-candidate-display-name definition atom (trs "Filter"))
                :kind         (atom-predicate-kind definition atom)}))))

(defn- source-display-name
  [source]
  (or (:display-name source) (:name source)))

(defn- description-on-source
  [description source]
  (if-let [source-name (source-display-name source)]
    (trs "{0} on {1}" description source-name)
    description))

(defn- conditional-base-aggregation
  [[operator _opts field :as clause]]
  (case operator
    :count-where    (lib/count)
    :distinct-where (lib/distinct field)
    :sum-where      (lib/sum field)
    clause))

(defn- measure-suggested-name
  [definition {:keys [type condition]}]
  (let [clause (get-in definition [:stages 0 :aggregation 0])]
    (if (and (contains? candidate-mining/conditional-aggregation-operators type) condition)
      (let [base-name      (safe-display-name definition
                                              (conditional-base-aggregation clause)
                                              (trs "Measure"))
            condition-name (detailed-candidate-display-name definition condition (trs "matching condition"))]
        (trs "{0} where {1}" base-name condition-name))
      (safe-display-name definition clause (trs "Measure")))))

(defn- measure-base-name
  [definition {:keys [type condition]}]
  (let [clause (get-in definition [:stages 0 :aggregation 0])]
    (safe-display-name definition
                       (if (and (contains? candidate-mining/conditional-aggregation-operators type) condition)
                         (conditional-base-aggregation clause)
                         clause)
                       (trs "Measure"))))

(defn- candidate-naming-definition
  [{:keys [definition], metadata-provider ::metadata-provider}]
  (cond-> definition
    metadata-provider (assoc :lib/metadata metadata-provider)))

(defn- measure-with-suggestions
  [{:keys [aggregation source] :as candidate}]
  (let [naming-definition (candidate-naming-definition candidate)
        suggested-name    (measure-suggested-name naming-definition aggregation)
        base-name         (measure-base-name naming-definition aggregation)
        condition-atoms   (some->> (:condition aggregation)
                                   (candidate-atom-details naming-definition))
        description    (if (contains? candidate-mining/conditional-aggregation-operators (:type aggregation))
                         suggested-name
                         (safe-definition-description naming-definition :aggregation suggested-name))]
    (-> candidate
        (dissoc ::metadata-provider)
        (assoc :aggregation (cond-> (assoc aggregation :base-name base-name)
                              (seq condition-atoms) (assoc :condition-atoms condition-atoms))
               :suggested-name (u.str/elide suggested-name candidate-name-max-length)
               :suggested-description (description-on-source description source)))))

(defn- segment-with-suggestions
  [{:keys [predicate source] :as candidate}]
  (let [naming-definition (candidate-naming-definition candidate)
        compact-name      (safe-display-name naming-definition predicate (trs "Segment"))
        suggested-name    (detailed-candidate-display-name naming-definition predicate (trs "Segment"))
        atoms             (candidate-atom-details naming-definition predicate)
        description       (if (= compact-name suggested-name)
                            (safe-definition-description naming-definition
                                                         :filters
                                                         (trs "Filtered by {0}" suggested-name))
                            (trs "Filtered by {0}" suggested-name))]
    (-> candidate
        (dissoc ::metadata-provider)
        (assoc :atoms atoms
               :suggested-name (u.str/elide suggested-name candidate-name-max-length)
               :suggested-description (description-on-source description source)))))

(defn- fallback-atom-details
  [predicate]
  (when predicate
    (mapv (fn [atom]
            {:signature    (candidate-mining/canonical-signature atom)
             :display-name (trs "Filter")
             :kind         :other})
          (conjunction-atoms predicate))))

(defn- fallback-suggestions
  [{:keys [aggregation predicate source] :as candidate} candidate-type]
  (let [entity-name (case candidate-type
                      :measure (trs "Measure")
                      :segment (trs "Segment"))
        description (case candidate-type
                      :measure entity-name
                      :segment (trs "Filtered by {0}" entity-name))]
    (cond-> (-> candidate
                (dissoc ::metadata-provider)
                (assoc :suggested-name entity-name
                       :suggested-description (description-on-source description source)))
      (= candidate-type :measure) (assoc :aggregation (assoc aggregation :base-name entity-name))
      (= candidate-type :segment) (assoc :atoms (fallback-atom-details predicate)))))

(defn suggestions-or-fallback
  "Run a candidate suggestion builder without allowing stale metadata to abort mining."
  [candidate candidate-type suggestions-fn]
  (try
    (suggestions-fn candidate)
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to generate candidate suggestions")
      (fallback-suggestions candidate candidate-type))))

(defn add-measure-suggestions
  "Attach deterministic presentation metadata to a mined Measure candidate."
  [candidate]
  (suggestions-or-fallback candidate :measure measure-with-suggestions))

(defn add-segment-suggestions
  "Attach deterministic presentation metadata to a mined Segment candidate."
  [candidate]
  (suggestions-or-fallback candidate :segment segment-with-suggestions))

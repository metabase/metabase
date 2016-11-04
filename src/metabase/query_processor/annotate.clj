(ns metabase.query-processor.annotate
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.db :as db]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.interface :as i]
            [metabase.util :as u])
  (:import metabase.query_processor.interface.ExpressionRef))

;; Fields should be returned in the following order:
;; 1.  Breakout Fields
;;
;; 2.  Aggregation Fields (e.g. sum, count)
;;
;; 3.  Fields clause Fields, if they were added explicitly
;;
;; 4.  All other Fields, sorted by:
;;     A.  :position (ascending)
;;         Users can manually specify default Field ordering for a Table in the Metadata admin. In that case, return Fields in the specified
;;         order; most of the time they'll have the default value of 0, in which case we'll compare...
;;
;;     B.  :special_type "group" -- :id Fields, then :name Fields, then everyting else
;;         Attempt to put the most relevant Fields first. Order the Fields as follows:
;;         1.  :id Fields
;;         2.  :name Fields
;;         3.  all other Fields
;;
;;     C.  Field Name
;;         When two Fields have the same :position and :special_type "group", fall back to sorting Fields alphabetically by name.
;;         This is arbitrary, but it makes the QP deterministic by keeping the results in a consistent order, which makes it testable.

;;; ## Field Resolution

(defn collect-fields
  "Return a sequence of all the `Fields` inside THIS, recursing as needed for collections.
   For maps, add or `conj` to property `:path`, recording the keypath used to reach each `Field.`

     (collect-fields {:name \"id\", ...})     -> [{:name \"id\", ...}]
     (collect-fields [{:name \"id\", ...}])   -> [{:name \"id\", ...}]
     (collect-fields {:a {:name \"id\", ...}) -> [{:name \"id\", :path [:a], ...}]"
  [this & [keep-date-time-fields?]]
  {:post [(every? (fn [f]
                    (or (instance? metabase.query_processor.interface.Field f)
                        (instance? metabase.query_processor.interface.ExpressionRef f)
                        (when keep-date-time-fields?
                          (instance? metabase.query_processor.interface.DateTimeField f)))) %)]}
  (condp instance? this
    ;; For a DateTimeField we'll flatten it back into regular Field but include the :unit info for the frontend.
    ;; Recurse so it is otherwise handled normally
    metabase.query_processor.interface.DateTimeField
    (let [{:keys [field unit]} this
          fields               (collect-fields (assoc field :unit unit) keep-date-time-fields?)]
      (if keep-date-time-fields?
        (for [field fields]
          (i/map->DateTimeField {:field field, :unit unit}))
        fields))

    metabase.query_processor.interface.Field
    (if-let [parent (:parent this)]
      [this parent]
      [this])

    metabase.query_processor.interface.ExpressionRef
    [(assoc this :field-display-name (:expression-name this))]

    clojure.lang.IPersistentMap
    (for [[k v] (seq this)
          field (collect-fields v keep-date-time-fields?)
          :when field]
      (assoc field :source k))

    clojure.lang.Sequential
    (for [[i field] (m/indexed (mapcat (u/rpartial collect-fields keep-date-time-fields?) this))]
      (assoc field :clause-position i))

    nil))

(defn- qualify-field-name
  "Update the `field-name` to reflect the name we expect to see coming back from the query.
   (This is for handling Mongo nested Fields, I think (?))"
  [field]
  {:post [(keyword? (:field-name %))]}
  (assoc field :field-name (keyword (str/join \. (rest (i/qualified-name-components field))))))

(defn- ag-type->field-name
  "Return the (keyword) name that should be used for the column in the results. This is the same as the name of the aggregation,
   except for `distinct`, which is called `:count` for unknown reasons and/or historical accident."
  [ag-type]
  {:pre [(keyword? ag-type)]}
  (if (= ag-type :distinct)
    :count
    ag-type))

(defn- add-aggregate-field-if-needed
  "Add a Field containing information about an aggregate column such as `:count` or `:distinct` if needed."
  [{aggregations :aggregation} fields]
  (if (or (empty? aggregations)
          (= (:aggregation-type (first aggregations)) :rows))
    fields
    (concat fields (for [{ag-type :aggregation-type, ag-field :field} aggregations]
                     (merge (let [field-name (ag-type->field-name ag-type)]
                              {:source             :aggregation
                               :field-name         field-name
                               :field-display-name field-name
                               :base-type          (:base-type ag-field)
                               :special-type       (:special-type ag-field)})
                            ;; Always treat count or distinct count as an integer even if the DB in question returns it as something wacky like a BigDecimal or Float
                            (when (contains? #{:count :distinct} ag-type)
                              {:base-type    :type/Integer
                               :special-type :type/Number})
                            ;; For the time being every Expression is an arithmetic operator and returns a floating-point number, so hardcoding these types is fine;
                            ;; In the future when we extend Expressions to handle more functionality we'll want to introduce logic that associates a return type with a given expression.
                            ;; But this will work for the purposes of a patch release.
                            (when (instance? ExpressionRef ag-field)
                              {:base-type    :type/Float
                               :special-type :type/Number}))))))

(defn- add-unknown-fields-if-needed
  "When create info maps for any fields we didn't expect to come back from the query.
   Ideally, this should never happen, but on the off chance it does we still want to return it in the results."
  [actual-keys fields]
  {:pre [(set? actual-keys)
         (every? keyword? actual-keys)]}
  (let [expected-keys (u/prog1 (set (map :field-name fields))
                        (assert (every? keyword? <>)))
        missing-keys  (set/difference actual-keys expected-keys)]
    (when (seq missing-keys)
      (log/warn (u/format-color 'yellow "There are fields we weren't expecting in the results: %s\nExpected: %s\nActual: %s"
                  missing-keys expected-keys actual-keys)))
    (concat fields (for [k missing-keys]
                     {:base-type          :type/*
                      :preview-display    true
                      :special-type       nil
                      :field-name         k
                      :field-display-name k}))))


;;; ## Field Sorting

;; We sort Fields with a "importance" vector like [source-importance position special-type-importance name]

(defn- source-importance-fn
  "Create a function to return a importance for FIELD based on its source clause in the query.
   e.g. if a Field comes from a `:breakout` clause, we should return that column first in the results."
  [{:keys [fields-is-implicit]}]
  (fn [{:keys [source]}]
    (cond
      (= source :breakout)          :0-breakout
      (= source :aggregation)       :1-aggregation
      (and (not fields-is-implicit)
           (= source :fields))      :2-fields
      :else                         :3-other)))

(defn- special-type-importance
  "Return a importance for FIELD based on the relative importance of its `:special-type`.
   i.e. a Field with special type `:id` should be sorted ahead of all other Fields in the results."
  [{:keys [special-type]}]
  (cond
    (isa? special-type :type/PK)   :0-id
    (isa? special-type :type/Name) :1-name
    :else                          :2-other))

(defn- field-importance-fn
  "Create a function to return an \"importance\" vector for use in sorting FIELD."
  [query]
  (let [source-importance (source-importance-fn query)]
    (fn [{:keys [position clause-position field-name source], :as field}]
      [(source-importance field)
       (or position
           (when (contains? #{:fields :breakout} source)
             clause-position)
           Integer/MAX_VALUE)
       (special-type-importance field)
       field-name])))

(defn- sort-fields
  "Sort FIELDS by their \"importance\" vectors."
  [query fields]
  (let [field-importance (field-importance-fn query)]
    (when-not @(resolve 'metabase.query-processor/*disable-qp-logging*)
      (log/debug (u/format-color 'yellow "Sorted fields:\n%s" (u/pprint-to-str (sort (map field-importance fields))))))
    (sort-by field-importance fields)))

(defn- convert-field-to-expected-format
  "Rename keys, provide default values, etc. for FIELD so it is in the format expected by the frontend."
  [field]
  {:pre  [field]
   :post [(keyword? (:name %))]}
  (let [defaults {:description nil
                  :id          nil
                  :table_id    nil}]
    (-> (merge defaults field)
        (update :field-display-name name)
        (set/rename-keys  {:base-type          :base_type
                           :field-id           :id
                           :field-name         :name
                           :field-display-name :display_name
                           :schema-name        :schema_name
                           :special-type       :special_type
                           :visibility-type    :visibility_type
                           :table-id           :table_id
                           :fk-field-id        :fk_field_id})
        (dissoc :position :clause-position :parent :parent-id :table-name))))

(defn- fk-field->dest-fn
  "Fetch fk info and return a function that returns the destination Field of a given Field."
  ([fields]
   (or (fk-field->dest-fn fields (for [{:keys [special_type id]} fields
                                       :when (isa? special_type :type/FK)]
                                   id))
       (constantly nil)))
  ;; Fetch the foreign key fields whose origin is in the returned Fields, create a map of origin-field-id->destination-field-id
  ([fields fk-ids]
   (when (seq fk-ids)
     (fk-field->dest-fn fields fk-ids (db/select-id->field :fk_target_field_id Field
                                        :id                 [:in fk-ids]
                                        :fk_target_field_id [:not= nil]))))
  ;; Fetch the destination Fields referenced by the foreign keys
  ([fields fk-ids id->dest-id]
   (when (seq id->dest-id)
     (fk-field->dest-fn fields fk-ids id->dest-id (u/key-by :id (db/select [Field :id :name :display_name :table_id :description :base_type :special_type :visibility_type]
                                                                  :id [:in (vals id->dest-id)])))))
  ;; Return a function that will return the corresponding destination Field for a given Field
  ([fields fk-ids id->dest-id dest-id->field]
   (fn [{:keys [id]}]
     (some-> id id->dest-id dest-id->field))))

(defn- add-extra-info-to-fk-fields
  "Add `:extra_info` about foreign keys to `Fields` whose `special_type` is a `:type/FK`."
  [fields]
  (let [field->dest (fk-field->dest-fn fields)]
    (for [field fields]
      (let [{:keys [table_id], :as dest-field} (field->dest field)]
        (assoc field
          :target     (when dest-field
                        (into {} dest-field))
          :extra_info (if table_id
                        {:target_table_id table_id}
                        {}))))))

(defn- resolve-sort-and-format-columns
  "Collect the Fields referenced in QUERY, sort them according to the rules at the top
   of this page, format them as expected by the frontend, and return the results."
  [query result-keys]
  {:pre [(set? result-keys)]}
  (when (seq result-keys)
    (->> (collect-fields (dissoc query :expressions))
         (map qualify-field-name)
         (add-aggregate-field-if-needed query)
         (map (u/rpartial update :field-name keyword))
         (add-unknown-fields-if-needed result-keys)
         (sort-fields query)
         (map convert-field-to-expected-format)
         (filter (comp (partial contains? result-keys) :name))
         (m/distinct-by :name)
         add-extra-info-to-fk-fields)))

(defn annotate
  "Post-process a structured query to add metadata to the results. This stage:

  1.  Sorts the results according to the rules at the top of this page
  2.  Resolves the Fields returned in the results and adds information like `:columns` and `:cols`
      expected by the frontend."
  [query {:keys [columns rows]}]
  (let [row-maps (for [row rows]
                   (zipmap columns row))
        cols    (resolve-sort-and-format-columns (:query query) (set columns))
        columns (mapv :name cols)]
    {:cols    (vec (for [col cols]
                     (update col :name name)))
     :columns (mapv name columns)
     :rows    (for [row row-maps]
                (mapv row columns))}))

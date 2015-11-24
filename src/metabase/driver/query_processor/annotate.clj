(ns metabase.driver.query-processor.annotate
  (:refer-clojure :exclude [==])
  (:require (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.db :refer [sel]]
            [metabase.driver.query-processor.interface :as i]
            (metabase.models [field :refer [Field], :as field]
                             [foreign-key :refer [ForeignKey]])
            [metabase.util :as u]))

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
                    (or (instance? metabase.driver.query_processor.interface.Field f)
                        (when keep-date-time-fields?
                          (instance? metabase.driver.query_processor.interface.DateTimeField f)))) %)]}
  (condp instance? this
    ;; For a DateTimeField we'll flatten it back into regular Field but include the :unit info for the frontend.
    ;; Recurse so it is otherwise handled normally
    metabase.driver.query_processor.interface.DateTimeField
    (let [{:keys [field unit]} this
          fields               (collect-fields (assoc field :unit unit) keep-date-time-fields?)]
      (if keep-date-time-fields?
        (for [field fields]
          (i/map->DateTimeField {:field field, :unit unit}))
        fields))

    metabase.driver.query_processor.interface.Field
    (if-let [parent (:parent this)]
      ;; Nested Mongo fields come back inside of their parent when you specify them in the fields clause
      ;; e.g. (Q fields venue...name) will return rows like {:venue {:name "Kyle's Low-Carb Grill"}}
      ;; Until we fix this the right way we'll just include the parent Field in the :query-fields list so the pattern
      ;; matching works correctly.
      [this parent]
      [this])

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
  (assoc field :field-name (->> (rest (i/qualified-name-components field))
                                (interpose ".")
                                (apply str)
                                keyword)))

(defn- add-aggregate-field-if-needed
  "Add a Field containing information about an aggregate column such as `:count` or `:distinct` if needed."
  [{{ag-type :aggregation-type, ag-field :field, :as ag} :aggregation} fields]
  (if (or (not ag-type)
          (= ag-type :rows))
    fields
    (conj fields (merge {:source :aggregation}
                        (if (contains? #{:count :distinct} ag-type)
                          {:base-type          :IntegerField
                           :field-name         :count
                           :field-display-name :count
                           :special-type       :number}
                          (merge (select-keys ag-field [:base-type :special-type])
                                 {:field-name         ag-type
                                  :field-display-name ag-type}))))))

(defn- add-unknown-fields-if-needed
  "When create info maps for any fields we didn't expect to come back from the query.
   Ideally, this should never happen, but on the off chance it does we still want to return it in the results."
  [actual-keys fields]
  {:pre [(set? actual-keys)
         (every? keyword? actual-keys)]}
  (let [expected-keys (set (map :field-name fields))
        _             (assert (every? keyword? expected-keys))
        missing-keys  (set/difference actual-keys expected-keys)]
    (when (seq missing-keys)
      (log/warn (u/format-color 'yellow "There are fields we weren't expecting in the results: %s\nExpected: %s\nActual: %s"
                  missing-keys expected-keys actual-keys)))
    (concat fields (for [k missing-keys]
                     {:base-type          :UnknownField
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
    (or (when (= source :breakout)
          :0-breakout)
        (when (= source :aggregation)
          :1-aggregation)
        (when-not fields-is-implicit
          (when (= source :fields)
            :2-fields))
        :3-other)))

(defn- special-type-importance
  "Return a importance for FIELD based on the relative importance of its `:special-type`.
   i.e. a Field with special type `:id` should be sorted ahead of all other Fields in the results."
  [{:keys [special-type]}]
  (condp = special-type
    :id   :0-id
    :name :1-name
          :2-other))

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
    (when-not @(resolve 'metabase.driver.query-processor/*disable-qp-logging*)
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
                           :preview-display    :preview_display
                           :table-id           :table_id})
        (dissoc :position :clause-position :source :parent :parent-id :table-name))))

(defn- fk-field->dest-fn
  "Fetch fk info and return a function that returns the destination Field of a given Field."
  ([fields]
   (or (fk-field->dest-fn fields (for [{:keys [special_type id]} fields
                                       :when (= special_type :fk)]
                                   id))
       (constantly nil)))
  ;; Fetch the ForeignKey objects whose origin is in the returned Fields, create a map of origin-field-id->destination-field-id
  ([fields fk-ids]
   (when (seq fk-ids)
     (fk-field->dest-fn fields fk-ids (sel :many :field->field [ForeignKey :origin_id :destination_id]
                                           :origin_id      [in fk-ids]
                                           :destination_id [not= nil]))))
  ;; Fetch the destination Fields referenced by the ForeignKeys
  ([fields fk-ids id->dest-id]
   (when (seq id->dest-id)
     (fk-field->dest-fn fields fk-ids id->dest-id (sel :many :id->fields [Field :id :name :display_name :table_id :description :base_type :special_type :preview_display]
                                                       :id [in (vals id->dest-id)]))))
  ;; Return a function that will return the corresponding destination Field for a given Field
  ([fields fk-ids id->dest-id dest-id->field]
   (fn [{:keys [id]}]
     (some-> id id->dest-id dest-id->field))))

(defn- add-extra-info-to-fk-fields
  "Add `:extra_info` about `ForeignKeys` to `Fields` whose `special_type` is `:fk`."
  [fields]
  (let [field->dest (fk-field->dest-fn fields)]
    (for [field fields]
      (let [{:keys [table_id], :as dest-field} (field->dest field)]
        (assoc field
               :target     dest-field
               :extra_info (if table_id {:target_table_id table_id} {}))))))

(defn- resolve-sort-and-format-columns
  "Collect the Fields referenced in QUERY, sort them according to the rules at the top
   of this page, format them as expected by the frontend, and return the results."
  [query result-keys]
  {:pre [(set? result-keys)]}
  (when (seq result-keys)
    (->> (collect-fields query)
         (map qualify-field-name)
         (add-aggregate-field-if-needed query)
         (map (u/rpartial update :field-name keyword))
         (add-unknown-fields-if-needed result-keys)
         (sort-fields query)
         (map convert-field-to-expected-format)
         (filter (comp (partial contains? result-keys) :name))
         (m/distinct-by :name)
         add-extra-info-to-fk-fields)))

(defn post-annotate
  "QP middleware that runs directly after the the query is ran. This stage:

  1.  Sorts the results according to the rules at the top of this page
  2.  Resolves the Fields returned in the results and adds information like `:columns` and `:cols`
      expected by the frontend."
  [qp]
  (fn [query]
    (if (= :query (keyword (:type query)))
      (let [results     (qp query)
            result-keys (set (keys (first results)))
            cols        (resolve-sort-and-format-columns (:query query) result-keys)
            columns     (mapv :name cols)]
        {:cols    (vec (for [col cols]
                         (update col :name name)))
         :columns (mapv name columns)
         :rows    (for [row results]
                    (mapv row columns))})
      ;; for non-structured queries we do nothing
      (qp query))))

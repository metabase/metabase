(ns metabase.query-processor.annotate
  "Code that analyzes the results of running a query and adds relevant type information about results (including foreign key information).
   TODO - The code in this namespace could definitely use a little cleanup to make it a little easier to wrap one's head around :)"
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [interface :as i]
             [sort :as sort]]
            [toucan.db :as db])
  (:import [metabase.query_processor.interface Expression ExpressionRef]))

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

(defn aggregation-name
  "Return an appropriate field *and* display name for an `:aggregation` subclause (an aggregation or expression)."
  ^String [{custom-name :custom-name, aggregation-type :aggregation-type, :as ag}]
  (when-not i/*driver*
    (throw (Exception. "metabase.query-processor.interface/*driver* is unbound.")))
  (cond
    ;; if a custom name was provided use it
    custom-name               (driver/format-custom-field-name i/*driver* custom-name)
    ;; for unnamed expressions, just compute a name like "sum + count"
    (instance? Expression ag) (let [{:keys [operator args]} ag]
                                (str/join (str " " (name operator) " ")
                                          (for [arg args]
                                            (if (instance? Expression arg)
                                              (str "(" (aggregation-name arg) ")")
                                              (aggregation-name arg)))))
    ;; for unnamed normal aggregations, the column alias is always the same as the ag type except for `:distinct` with is called `:count` (WHY?)
    aggregation-type          (if (= (keyword aggregation-type) :distinct)
                                "count"
                                (name aggregation-type))))

(defn- expression-aggregate-field-info [expression]
  (let [ag-name (aggregation-name expression)]
    {:source             :aggregation
     :field-name         ag-name
     :field-display-name ag-name
     :base-type          :type/Number
     :special-type       :type/Number}))

(defn- aggregate-field-info
  "Return appropriate column metadata for an `:aggregation` clause."
  [{ag-type :aggregation-type, ag-field :field, :as ag}]
  (merge (let [field-name (aggregation-name ag)]
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
            :special-type :type/Number})))

(defn- has-aggregation?
  "Does QUERY have an aggregation?"
  [{aggregations :aggregation}]
  (or (empty? aggregations)
      ;; TODO - Not sure this needs to be checked anymore since `:rows` is a legacy way to specifiy "no aggregations" and should be stripped out during preprocessing
      (= (:aggregation-type (first aggregations)) :rows)))

(defn- add-aggregate-fields-if-needed
  "Add a Field containing information about an aggregate columns such as `:count` or `:distinct` if needed."
  [{aggregations :aggregation, :as query} fields]
  (if (has-aggregation? query)
    fields
    (concat fields (for [ag aggregations]
                     (if (instance? Expression ag)
                       (expression-aggregate-field-info ag)
                       (aggregate-field-info ag))))))


(defn- generic-info-for-missing-key
  "Return a set of bare-bones metadata for a Field named K when all else fails."
  [k]
  {:base-type          :type/*
   :preview-display    true
   :special-type       nil
   :field-name         k
   :field-display-name k})

(defn- info-for-duplicate-field
  "The Clojure JDBC driver automatically appends suffixes like `count_2` to duplicate columns if multiple columns come back with the same name;
   since at this time we can't resolve those normally (#1786) fall back to using the metadata for the first column (e.g., `count`).
   This is definitely a HACK, but in most cases this should be correct (or at least better than the generic info) for the important things like type information."
  [fields k]
  (when-let [[_ field-name-without-suffix] (re-matches #"^(.*)_\d+$" (name k))]
    (some (fn [{field-name :field-name, :as field}]
            (when (= (name field-name) field-name-without-suffix)
              (merge (generic-info-for-missing-key k)
                     (select-keys field [:base-type :special-type :source]))))
          fields)))

(defn- info-for-missing-key
  "Metadata for a field named K, which we weren't able to resolve normally.
   If possible, we work around This defaults to generic information "
  [fields k]
  (or (info-for-duplicate-field fields k)
      (generic-info-for-missing-key k)))

(defn- add-unknown-fields-if-needed
  "When create info maps for any fields we didn't expect to come back from the query.
   Ideally, this should never happen, but on the off chance it does we still want to return it in the results."
  [actual-keys fields]
  {:pre [(set? actual-keys) (every? keyword? actual-keys)]}
  (let [expected-keys (u/prog1 (set (map :field-name fields))
                        (assert (every? keyword? <>)))
        missing-keys  (set/difference actual-keys expected-keys)]
    (when (seq missing-keys)
      (log/warn (u/format-color 'yellow "There are fields we weren't expecting in the results: %s\nExpected: %s\nActual: %s"
                  missing-keys expected-keys actual-keys)))
    (concat fields (for [k missing-keys]
                     (info-for-missing-key fields k)))))

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
        (set/rename-keys {:base-type          :base_type
                          :field-display-name :display_name
                          :field-id           :id
                          :field-name         :name
                          :fk-field-id        :fk_field_id
                          :preview-display    :preview_display
                          :schema-name        :schema_name
                          :special-type       :special_type
                          :table-id           :table_id
                          :visibility-type    :visibility_type})
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
         (add-aggregate-fields-if-needed query)
         (map (u/rpartial update :field-name keyword))
         (add-unknown-fields-if-needed result-keys)
         (sort/sort-fields query)
         (map convert-field-to-expected-format)
         (filter (comp (partial contains? result-keys) :name))
         (m/distinct-by :name)
         add-extra-info-to-fk-fields)))

(defn annotate-and-sort
  "Post-process a structured query to add metadata to the results. This stage:

  1.  Sorts the results according to the rules at the top of this page
  2.  Resolves the Fields returned in the results and adds information like `:columns` and `:cols`
      expected by the frontend."
  [query {:keys [columns rows], :as results}]
  (let [row-maps (for [row rows]
                   (zipmap columns row))
        cols    (resolve-sort-and-format-columns (:query query) (set columns))
        columns (mapv :name cols)]
    (assoc results
      :cols    (vec (for [col cols]
                      (update col :name name)))
      :columns (mapv name columns)
      :rows    (for [row row-maps]
                 (mapv row columns)))))

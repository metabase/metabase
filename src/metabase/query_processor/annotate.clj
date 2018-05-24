(ns metabase.query-processor.annotate
  "Code that analyzes the results of running a query and adds relevant type information about results (including
  foreign key information). This also does things like taking lisp-case keys used in the QP and converting them back
  to snake_case ones used in the frontend.

  TODO - The code in this namespace could definitely use a little cleanup to make it a little easier to wrap one's
         head around :)

  TODO - This namespace should be called something like `metabase.query-processor.middleware.annotate`"
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [field :refer [Field]]
             [humanization :as humanization]]
            [metabase.query-processor
             [interface :as i]
             [sort :as sort]]
            [toucan.db :as db])
  (:import [metabase.query_processor.interface Expression ExpressionRef]))

;;; ## Field Resolution

(defn- valid-collected-field? [keep-date-time-fields? f]
  (or
   ;; is `f` an instance of `Field`, `FieldLiteral`, or `ExpressionRef`?
   (some (u/rpartial instance? f)
         [metabase.query_processor.interface.Field
          metabase.query_processor.interface.FieldLiteral
          metabase.query_processor.interface.ExpressionRef])
   ;; or if we're keeping DateTimeFields, is is an instance of `DateTimeField`?
   (when keep-date-time-fields?
     (instance? metabase.query_processor.interface.DateTimeField f))))

(defn collect-fields
  "Return a sequence of all the `Fields` inside THIS, recursing as needed for collections.
   For maps, add or `conj` to property `:path`, recording the keypath used to reach each `Field.`

     (collect-fields {:name \"id\", ...})     -> [{:name \"id\", ...}]
     (collect-fields [{:name \"id\", ...}])   -> [{:name \"id\", ...}]
     (collect-fields {:a {:name \"id\", ...}) -> [{:name \"id\", :path [:a], ...}]"
  {:style/indent 0}
  [this & [keep-date-time-fields?]]
  {:post [(every? (partial valid-collected-field? keep-date-time-fields?) %)]}
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

    metabase.query_processor.interface.BinnedField
    (let [{:keys [strategy min-value max-value], nested-field :field} this]
      [(assoc nested-field :binning_info {:binning_strategy strategy
                                          :bin_width (:bin-width this)
                                          :num_bins (:num-bins this)
                                          :min_value min-value
                                          :max_value max-value})])

    metabase.query_processor.interface.Field
    (if-let [parent (:parent this)]
      [this parent]
      [this])

    metabase.query_processor.interface.FieldLiteral
    [(assoc this
       :field-id           [:field-literal (:field-name this) (:base-type this)]
       :field-display-name (humanization/name->human-readable-name (:field-name this)))]

    metabase.query_processor.interface.ExpressionRef
    [(assoc this
       :field-display-name (:expression-name this)
       :base-type          :type/Float
       :special-type       :type/Number)]

    ;; for every value in a map in the query we'll descend into the map and find all the fields contained therein and
    ;; mark the key as each field's source. e.g. if we descend into the `:breakout` columns for a query each field
    ;; returned will get a `:source` of `:breakout` The source is important since it is used to determine sort order
    ;; for for columns
    clojure.lang.IPersistentMap
    (for [[k v] (seq this)
          field (collect-fields v keep-date-time-fields?)
          :when field]
      (if (= k :source-query)
        ;; For columns collected from a source query...
        ;; 1) Make sure they didn't accidentally pick up an integer ID if the fields clause was added implicitly. If
        ;;     it does the frontend won't know how to use the field since it won't match up with the same field in the
        ;;     "virtual" table metadata.
        ;; 2) Keep the original `:source` rather than replacing it with `:source-query` since the frontend doesn't
        ;;    know what to do with that.
        (if (= (:unit field) :year)
          ;; if the field is broken out by year we don't want to advertise it as type/DateTime because you can't do a
          ;; datetime breakout on the years that come back (they come back as text). So instead just tell people it's
          ;; a Text column
          (assoc field
            :field-id [:field-literal (:field-name field) :type/Text]
            :base-type :type/Text
            :unit      nil)
          (assoc field
            :field-id [:field-literal (:field-name field) (:base-type field)]))
        ;; For all other fields just add `:source` as described above
        (assoc field :source k)))

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
    ;; for unnamed normal aggregations, the column alias is always the same as the ag type except for `:distinct` with
    ;; is called `:count` (WHY?)
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
         ;; Always treat count or distinct count as an integer even if the DB in question returns it as something
         ;; wacky like a BigDecimal or Float
         (when (contains? #{:count :distinct} ag-type)
           {:base-type    :type/Integer
            :special-type :type/Number})
         ;; For the time being every Expression is an arithmetic operator and returns a floating-point number, so
         ;; hardcoding these types is fine; In the future when we extend Expressions to handle more functionality
         ;; we'll want to introduce logic that associates a return type with a given expression. But this will work
         ;; for the purposes of a patch release.
         (when (or (instance? ExpressionRef ag-field)
                   (instance? Expression ag-field))
           {:base-type    :type/Float
            :special-type :type/Number})))

(defn- has-aggregation?
  "Does QUERY have an aggregation?"
  [{aggregations :aggregation}]
  (or (empty? aggregations)
      ;; TODO - Not sure this needs to be checked anymore since `:rows` is a legacy way to specifiy "no aggregations"
      ;; and should be stripped out during preprocessing
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
  "Return a set of bare-bones metadata for a Field named K when all else fails.
   Scan the INITIAL-VALUES of K in an attempt to determine the `base-type`."
  [k & [initial-values]]
  {:base-type          (if (seq initial-values)
                         (driver/values->base-type initial-values)
                         :type/*)
   :preview-display    true
   :special-type       nil
   :field-name         k
   :field-display-name (humanization/name->human-readable-name (name k))})

;; TODO - I'm not 100% sure the code reaches this point any more since the `collect-fields` logic now handles nested
;; queries maybe this is used for queries where the source query is native?
(defn- info-for-column-from-source-query
  "Return information about a column that comes back when we're using a source query.
   (This is basically the same as the generic information, but we also add `:id` and `:source`
   columns so drill-through operations can be done on it)."
  [k & [initial-values]]
  (let [col (generic-info-for-missing-key k initial-values)]
    (assoc col
      :id     [:field-literal k (:base-type col)]
      :source :fields)))


(defn- info-for-duplicate-field
  "The Clojure JDBC driver automatically appends suffixes like `count_2` to duplicate columns if multiple columns come
  back with the same name; since at this time we can't resolve those normally (#1786) fall back to using the metadata
  for the first column (e.g., `count`). This is definitely a HACK, but in most cases this should be correct (or at
  least better than the generic info) for the important things like type information."
  [fields k]
  (when-let [[_ field-name-without-suffix] (re-matches #"^(.*)_\d+$" (name k))]
    (some (fn [{field-name :field-name, :as field}]
            (when (= (name field-name) field-name-without-suffix)
              (merge (generic-info-for-missing-key k)
                     (select-keys field [:base-type :special-type :source]))))
          fields)))

(defn- info-for-missing-key
  "Metadata for a field named K, which we weren't able to resolve normally."
  [inner-query fields k initial-values]
  (or (when (:source-query inner-query)
        (info-for-column-from-source-query k initial-values))
      (info-for-duplicate-field fields k)
      (generic-info-for-missing-key k initial-values)))

(defn- add-unknown-fields-if-needed
  "When create info maps for any fields we didn't expect to come back from the query.
   Ideally, this should never happen, but on the off chance it does we still want to return it in the results."
  [inner-query actual-keys initial-rows fields]
  {:pre [(sequential? actual-keys) (every? keyword? actual-keys)]}
  (let [expected-keys (u/prog1 (set (map :field-name fields))
                        (assert (every? keyword? <>)))
        missing-keys  (set/difference (set actual-keys) expected-keys)]
    (when (seq missing-keys)
      (log/warn (u/format-color 'yellow (str "There are fields we (maybe) weren't expecting in the results: %s\n"
                                             "Expected: %s\nActual: %s")
                  missing-keys expected-keys (set actual-keys))))
    (concat fields (for [k     actual-keys
                         :when (contains? missing-keys k)]
                     (info-for-missing-key inner-query fields k (map k initial-rows))))))

(defn- fixup-renamed-fields
  "After executing the query, it's possible that java.jdbc changed the name of the column that was originally in the
  query. This can happen when java.jdbc finds two columns with the same name, it will append an integer (like _2) on
  the end. When this is done on an existing column in the query, this function fixes that up, updating the column
  information we have with the new name that java.jdbc assigned the column. The `add-unknown-fields-if-needed`
  function above is similar, but is used when we don't have existing information on that column and need to infer it."
  [query actual-keys]
  (let [expected-field-names (set (map (comp keyword name) (:fields query)))]
    (if (= expected-field-names (set actual-keys))
      query
      (update query :fields
              (fn [fields]
                (mapv (fn [expected-field actual-key]
                        (if (not= (name expected-field) (name actual-key))
                          (assoc expected-field :field-name (name actual-key))
                          expected-field))
                      fields actual-keys))))))

(defn- convert-field-to-expected-format
  "Rename keys, provide default values, etc. for FIELD so it is in the format expected by the frontend."
  [field]
  {:pre  [field]
   :post [(keyword? (:name %))]}
  (let [defaults {:description nil
                  :id          nil
                  :table_id    nil}]
    (-> (merge defaults field)
        (update :field-display-name #(when % (name %)))
        (set/rename-keys {:base-type          :base_type
                          :field-display-name :display_name
                          :field-id           :id
                          :field-name         :name
                          :fk-field-id        :fk_field_id
                          :preview-display    :preview_display
                          :schema-name        :schema_name
                          :special-type       :special_type
                          :table-id           :table_id
                          :visibility-type    :visibility_type
                          :remapped-to        :remapped_to
                          :remapped-from      :remapped_from})
        (dissoc :position :clause-position :parent :parent-id :table-name :database-type))))

(defn- fk-field->dest-fn
  "Fetch fk info and return a function that returns the destination Field of a given Field."
  ([fields]
   (or (fk-field->dest-fn fields (for [{:keys [special_type id]} fields
                                       :when  (and (isa? special_type :type/FK)
                                                   (integer? id))]
                                   id))
       (constantly nil)))
  ;; Fetch the foreign key fields whose origin is in the returned Fields, create a map of
  ;; origin-field-id->destination-field-id
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
  ([_ _ id->dest-id dest-id->field]
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
  "Collect the Fields referenced in INNER-QUERY, sort them according to the rules at the top of this page, format them
  as expected by the frontend, and return the results."
  [inner-query result-keys initial-rows]
  {:pre [(sequential? result-keys)]}
  (when (seq result-keys)
    (let [result-keys-set (set result-keys)
          query-with-renamed-columns (fixup-renamed-fields inner-query result-keys)]
      (->> (dissoc query-with-renamed-columns :expressions)
           collect-fields
           ;; qualify the field name to make sure it matches what will come back. (For Mongo nested queries only)
           (map qualify-field-name)
           ;; add entries for aggregate fields
           (add-aggregate-fields-if-needed inner-query)
           ;; make field-name a keyword
           (map (u/rpartial update :field-name keyword))
           ;; add entries for fields we weren't expecting
           (add-unknown-fields-if-needed inner-query result-keys initial-rows)
           ;; remove expected fields not present in the results, and make sure they're unique
           (filter (comp (partial contains? (set result-keys)) :field-name))
           ;; now sort the fields
           (sort/sort-fields inner-query)
           ;; remove any duplicate entires
           (m/distinct-by :field-name)
           ;; convert them to the format expected by the frontend
           (map convert-field-to-expected-format)
           ;; add FK info
           add-extra-info-to-fk-fields))))

(defn annotate-and-sort
  "Post-process a structured query to add metadata to the results. This stage:

  1.  Sorts the results according to the rules at the top of this page
  2.  Resolves the Fields returned in the results and adds information like `:columns` and `:cols` expected by the
      frontend."
  [query {:keys [columns rows], :as results}]
  (let [row-maps (for [row rows]
                   (zipmap columns row))
        cols    (resolve-sort-and-format-columns (:query query) (distinct columns) (take 10 row-maps))
        columns (mapv :name cols)]
    (assoc results
      :cols    (vec (for [col cols]
                      (update col :name name)))
      :columns (mapv name columns)
      :rows    (for [row row-maps]
                 (mapv row columns)))))

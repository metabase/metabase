(ns metabase.driver.query-processor.annotate
  (:refer-clojure :exclude [==])
  (:require (clojure.core.logic [arithmetic :as ar]
                                [fd :as fd])
            [clojure.core.logic :refer :all]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [clojure.tools.macro :refer [macrolet]]
            [metabase.db :refer [sel]]
            [metabase.driver.query-processor.interface :as i]
            (metabase.models [field :refer [Field], :as field]
                             [foreign-key :refer [ForeignKey]])
            [metabase.util :as u]
            [metabase.util.logic :refer :all]))

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

;;; # ---------------------------------------- FIELD COLLECTION  ----------------------------------------

;; Walk the expanded query and collect the fields found therein. Associate some additional info to each that we'll pass to core.logic so it knows
;; how to order the results

;; TODO - Why do we need this again?
(defn- field-qualify-name [field]
  (assoc field :field-name (keyword (apply str (->> (rest (i/qualified-name-components field))
                                                    (interpose "."))))))

(defn- collect-fields
  "Return a sequence of all the `Fields` inside THIS, recursing as needed for collections.
   For maps, add or `conj` to property `:path`, recording the keypath used to reach each `Field.`

     (collect-fields {:name \"id\", ...})     -> [{:name \"id\", ...}]
     (collect-fields [{:name \"id\", ...}])   -> [{:name \"id\", ...}]
     (collect-fields {:a {:name \"id\", ...}) -> [{:name \"id\", :path [:a], ...}]"
  [this]
  {:post [(every? (partial instance? metabase.driver.query_processor.interface.Field) %)]}
  (condp instance? this
    ;; For a DateTimeField we'll flatten it back into regular Field but include the :unit info for the frontend.
    ;; Recurse so it is otherwise handled normally
    metabase.driver.query_processor.interface.DateTimeField
    (let [{:keys [field unit]} this]
      (collect-fields (assoc field :unit unit)))

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
          field (collect-fields v)
          :when field]
      (update field :path conj k))

    clojure.lang.Sequential
    (mapcat collect-fields this)

    nil))

(defn- flatten-fields
  "Flatten a group of fields, keeping those which are more important when duplicates exist."
  [fields]
  (vec (distinct (sort-by (fn [{[k] :path}]       ; more important versions of fields are the ones we'll actually see in results,
                            (cond                 ; this is important so we don't use return the wrong version of a Field (e.g. with the wrong unit)
                              (= k :breakout) 0   ; so look at each field's :path. For now, it's enough just to look at the first element.
                              (= k :fields)   1   ; (lower number = higher importance, because `sort` is ascending)
                              :else           2))
                          fields))))

(defn- flatten-collect-fields
  "Collect fields from COLL, and remove duplicates."
  [coll]
  (vec (for [field (flatten-fields (collect-fields coll))]
         (dissoc (field-qualify-name field)
                 :parent :parent-id :table-name :path)))) ; remove keys we don't need anymore


;;; # ---------------------------------------- COLUMN RESOLUTION & ORDERING (CORE.LOGIC)  ----------------------------------------

(defn- field-name°
  "A relation such that FIELD's name is FIELD-NAME."
  [field field-name]
  (all (trace-lvars "field-name°" field field-name)
       (featurec field {:field-name field-name})))

(defn- make-field-in°
  "Create a relation such that FIELD has an ID matching one of the Field IDs found in FORM."
  [form]
  (let [fields (collect-fields form)]
    (if-not (seq fields)
      (constantly fail)
      (let [ids-domain (apply fd/domain (sort (distinct (map :field-id fields))))]
        (fn [field]
          (all (trace-lvars "make-field-in°" field ids-domain)
               (fresh [id]
                 (featurec field {:field-id id})
                 (fd/in id ids-domain))))))))

(defn- breakout-field°
  "Create a relation such that a FIELD is present in the `:breakout` clause."
  [{:keys [breakout]}]
  (make-field-in° breakout))

(defn- explicit-fields-field°
  "Create a relation such that a FIELD is present in an explicitly specified `:fields` clause."
  [{:keys [fields-is-implicit fields], :as query}]
  (if fields-is-implicit
    (constantly fail)
    (make-field-in° fields)))

(defn- aggregate-field°
  "Create a relation such that a FIELD is an aggregate field like `:count` or `:sum`."
  [{{ag-type :aggregation-type, ag-field :field} :aggregation}]
  (if-not (contains? #{:avg :count :distinct :stddev :sum} ag-type)
    (constantly fail)
    (let [ag-field (if (contains? #{:count :distinct} ag-type)
                     {:base-type          :IntegerField
                      :field-name         :count
                      :field-display-name "count"
                      :special-type       :number}
                     (-> ag-field
                         (select-keys [:base-type :special-type])
                         (assoc :field-name         (if (= ag-type :distinct) :count
                                                        ag-type)
                                :field-display-name (if (= ag-type :distinct) "count"
                                                        (name ag-type)))))]
      (fn [out]
        (all (trace-lvars "aggregate-field°" out)
             (== out ag-field))))))

(defn- unknown-field°
  "Relation for handling otherwise unknown Fields. If we can't determine why we're seeing a given Field
   (i.e., all other relations like `breakout-field°` and `aggregate-field°` fail), this one will succeed
   as a last resort and bind some fallback properties of the Field, such as giving it a `:base-type` of
   `:UnknownField`. If this relation succeeds, it generally indicates a bug in the query processor."
  [field-name out]
  (all
   (== out {:base-type          :UnknownField
            :special-type       nil
            :field-name         field-name
            :field-display-name field-name})
   (trace-lvars "UNKNOWN FIELD - NOT PRESENT IN EXPANDED QUERY (!)" out)))

(defn- field°
  "Create a relation such that a FIELD is a normal `Field` referenced somewhere in QUERY, or an aggregate
   Field such as a `:count`."
  [query]
  (let [ag-field°         (aggregate-field° query)
        fields            (flatten-collect-fields query)
        field-name->field (zipmap (map :field-name fields) fields)
        normal-field°     (fn [field-name out]
                            (all (trace-lvars "normal-field°" field-name out)
                                 (if-let [field (field-name->field field-name)]
                                   (== out field)
                                   fail)))]
    (fn [field-name field]
      (all (trace-lvars "field°" field-name field)
           (conda
             ((normal-field° field-name field))
             ((ag-field° field)))))))

(def ^:const ^:private field-groups
  "Relative importance of each clause as a source of Fields for the purposes of ordering our results.
   e.g. if a Field comes from a `:breakout` clause, we should return that column first in the results."
  {:breakout        0
   :aggregation     1
   :explicit-fields 2
   :other           3})

(defn- field-group°
  "Create a relation such that OUT is the corresponding value of `field-groups` for FIELD."
  [query]
  (let [breakout° (breakout-field° query)
        agg°      (aggregate-field° query)
        xfields°  (explicit-fields-field° query)]
    (fn [field out]
      (all (trace-lvars "field-group°" field out)
           (conda
             ((breakout° field) (== out (field-groups :breakout)))
             ((agg° field)      (== out (field-groups :aggregation)))
             ((xfields° field)  (== out (field-groups :explicit-fields)))
             (s#                (== out (field-groups :other))))))))

(defn- field-position°
  "A relation such that FIELD's `:position` is OUT. `:position` is the index of the FIELD in its
   source clause, e.g. 2 if it was the third Field in the `:fields` clause where we found it."
  [field out]
  (all (trace-lvars "field-position°" field out)
       (featurec field {:position out})))

(def ^:const ^:private special-type-groups
  "Relative importance of different Field `:special-types` for the purposes of ordering.
   i.e. a Field with special type `:id` should be sorted ahead of all other Fields in the results."
  {:id    0
   :name  1
   :other 2})

(defn- special-type-group°
  "A relation such that OUT is the corresponding value of `special-type-groupds` for FIELD."
  [field out]
  (conda
   ((featurec field {:special-type :id})   (== out (special-type-groups :id)))
   ((featurec field {:special-type :name}) (== out (special-type-groups :name)))
   (s#                                     (== out (special-type-groups :other)))))

(defn- field-name<
  "Create a relation such that the name of Field F1 comes alphabetically before the name of Field F2."
  [query]
  (fn [f1 f2]
    (fresh [name-1 name-2]
      (trace-lvars "field-name<" f1 f2)
      (field-name° f1 name-1)
      (field-name° f2 name-2)
      (matches-seq-order° name-1 name-2 (:result-keys query)))))

(defn- clause-position<
  "Create a relation such that Field F1 comes before Field F2 in the clause where they were defined."
  [query]
  (let [group°          (field-group° query)
        breakout-fields (flatten-collect-fields (:breakout query))
        fields-fields   (flatten-collect-fields (:fields query))]
    (fn [f1 f2]
      (all (trace-lvars "clause-position<" f1 f2)
           (conda
             ((group° f1 (field-groups :breakout))        (matches-seq-order° f1 f2 breakout-fields))
             ((group° f1 (field-groups :explicit-fields)) (matches-seq-order° f1 f2 fields-fields)))))))

(defn- fields-sorted°
  "Create a relation such that Field F1 should be sorted ahead of Field F2 according to the rules
   listed at the top of this page."
  [query]
  (let [group°      (field-group° query)
        name<       (field-name< query)
        clause-pos< (clause-position< query)]
    (fn [f1 f2]
      (macrolet [(<-or-== [f & ==-clauses] `(all (trace-lvars "fields-sorted°" ~'f1 ~'f2)
                                                 (conda
                                                   ((fresh [v#]
                                                      (~f ~'f1 v#)
                                                      (~f ~'f2 v#)) ~@==-clauses)
                                                   ((fresh [v1# v2#]
                                                      (~f ~'f1 v1#)
                                                      (~f ~'f2 v2#)
                                                      (ar/< v1# v2#)) ~'s#))))]
        (<-or-== group°
          (<-or-== field-position°
            (conda
              ((group° f1 (field-groups :other)) (<-or-== special-type-group°
                                                   (name< f1 f2)))
              ((clause-pos< f1 f2)))))))))

(defn- resolve+order-cols
  "Use `core.logic` to determine the source of the RESULT-KEYS returned by running a QUERY,
   and sort them according to the rules at the top of this page."
  [{:keys [result-keys], :as query}]
  (when (seq result-keys)
    (first (let [fields       (vec (lvars (count result-keys)))
                 known-field° (field° query)]
             (run 1 [q]
               (everyg (fn [[result-key field]]
                         (conda
                           ((known-field°   result-key field))
                           ((unknown-field° result-key field))))
                       (zipmap result-keys fields))
               (sorted-permutation° (fields-sorted° query) fields q))))))


;;; # ---------------------------------------- COLUMN DETAILS  ----------------------------------------

;; Format the results in the way the front-end expects.

(defn- format-col
  "Rename keys, provide default values, etc. for FIELD so it is in the format expected by the frontend."
  [field]
  (merge {:description nil
          :id          nil
          :table_id    nil}
         (-> field
             (set/rename-keys  {:base-type          :base_type
                                :field-id           :id
                                :field-name         :name
                                :field-display-name :display_name
                                :schema-name        :schema_name
                                :special-type       :special_type
                                :preview-display    :preview_display
                                :table-id           :table_id})
             (dissoc :position))))

(defn- add-fields-extra-info
  "Add `:extra_info` about `ForeignKeys` to `Fields` whose `special_type` is `:fk`."
  [fields]
  ;; Get a sequence of add Field IDs that have a :special_type of FK
  (let [fk-field-ids            (->> fields
                                     (filter #(= (:special_type %) :fk))
                                     (map :id)
                                     (filter identity))
        ;; Look up the Foreign keys info if applicable.
        ;; Build a map of FK Field IDs -> Destination Field IDs
        field-id->dest-field-id (when (seq fk-field-ids)
                                  (sel :many :field->field [ForeignKey :origin_id :destination_id], :origin_id [in fk-field-ids], :destination_id [not= nil]))

        ;; Build a map of Destination Field IDs -> Destination Fields
        dest-field-id->field    (when (and (seq fk-field-ids)
                                           (seq (vals field-id->dest-field-id)))
                                  (sel :many :id->fields [Field :id :name :display_name :table_id :description :base_type :special_type :preview_display], :id [in (vals field-id->dest-field-id)]))]

    ;; Add the :extra_info + :target to every Field. For non-FK Fields, these are just {} and nil, respectively.
    (vec (for [{field-id :id, :as field} fields]
           (let [dest-field (when (seq fk-field-ids)
                              (some->> field-id
                                       field-id->dest-field-id
                                       dest-field-id->field))]
             (assoc field
                    :target     dest-field
                    :extra_info (if-not dest-field {}
                                        {:target_table_id (:table_id dest-field)})))))))

(defn post-annotate
  "QP middleware that runs directly after the the query is ran. This stage:

  1.  Sorts the results according to the rules at the top of this page
  2.  Resolves the Fields returned in the results and adds information like `:columns` and `:cols`
      expected by the frontend."
  [qp]
  (fn [query]
    (try
      (let [results (qp query)
            cols    (->> (assoc (:query query) :result-keys (vec (sort (keys (first results)))))
                         resolve+order-cols
                         (map format-col)
                         add-fields-extra-info)
            columns (map :name cols)]
        {:cols    (vec (for [col cols]
                         (update col :name name)))
         :columns (mapv name columns)
         :rows    (for [row results]
                    (mapv row columns))}))))

(u/ns-wrap-try-catch! :exclude 'x 'z 'post-annotate)

(require '[metabase.test.util.q :refer [Q]])
(defn x []
  (Q aggregate rows of categories use postgres
     page 1 items 5
     order id+))

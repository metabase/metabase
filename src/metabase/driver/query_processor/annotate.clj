(ns metabase.driver.query-processor.annotate
  (:refer-clojure :exclude [==])
  (:require [clojure.core.logic :refer :all]
            (clojure.core.logic [arithmetic :as ar]
                                [fd :as fd])
            [clojure.tools.macro :refer [macrolet]]
            (clojure [set :as set]
                     [string :as s])
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
  (condp instance? this
    clojure.lang.IPersistentMap
    (for [[k v] (seq this)
          field (collect-fields v)]
      (update field :path conj k))

    clojure.lang.Sequential
    (mapcat collect-fields this)

    metabase.driver.query_processor.interface.Field
    (if-let [{:keys [parent]} this]
      ;; Nested Mongo fields come back inside of their parent when you specify them in the fields clause
      ;; e.g. (Q fields venue...name) will return rows like {:venue {:name "Kyle's Low-Carb Grill"}}
      ;; Until we fix this the right way we'll just include the parent Field in the :query-fields list so the pattern
      ;; matching works correctly.
      [this parent]
      [this])

    ;; For a DateTimeField we'll flatten it back into regular Field but include the :unit info for the frontend
    metabase.driver.query_processor.interface.DateTimeField
    (recur (assoc (:field this) :unit (:unit this)))

    nil))

(defn- flatten-fields
  "Flatten a group of fields, keeping those which are more important when duplicates exist."
  [fields]
  (let [path-importance (fn [{[k] :path}]
                          (cond
                            (= k :breakout) 0     ; lower number = higher importance, because `sort` is ascending
                            (= k :fields)   1     ; more important versions of fields are the ones we'll actually see in results,
                            :else           2))]  ; so look at each field's :path. For now, it's enough just to look at the first element.
    (distinct (sort-by path-importance fields)))) ; this is important so we don't use return the wrong version of a Field (e.g. with the wrong unit)

(defn- flatten-collect-fields
  "Collect fields from COLL, and remove duplicates."
  [coll]
  (for [field (flatten-fields (collect-fields coll))]
    (dissoc (field-qualify-name field)
            :parent :parent-id :table-name :path)))  ; remove keys we don't need anymore

(defn- flatten-collect-ids-domain [form]
  (apply fd/domain (sort (map :field-id (flatten-collect-fields form)))))


;;; # ---------------------------------------- COLUMN RESOLUTION & ORDERING (CORE.LOGIC)  ----------------------------------------

;; Use core.logic to determine the appropriate ordering / result Fields

(defn- field-name° [field field-name]
  (featurec field {:field-name field-name}))

(defn- make-field-in° [items]
  (if-not (seq items)
    (constantly fail)
    (let [ids-domain (flatten-collect-ids-domain items)]
      (fn [field]
        (fresh [id]
          (featurec field {:field-id id})
          (fd/in id ids-domain))))))

(defn- breakout-field° [{:keys [breakout]}]
  (make-field-in° breakout))

(defn- explicit-fields-field° [{:keys [fields-is-implicit fields], :as query}]
  (if fields-is-implicit (constantly fail)
      (make-field-in° fields)))

(defn- aggregate-field° [{{ag-type :aggregation-type, ag-field :field} :aggregation}]
  (if-not (contains? #{:avg :count :distinct :stddev :sum} ag-type)
    (constantly fail)
    (let [ag-field (if (contains? #{:count :distinct} ag-type)
                     {:base-type    :IntegerField
                      :field-name   :count
                      :field-display-name "count"
                      :special-type :number}
                     (-> ag-field
                         (select-keys [:base-type :special-type])
                         (assoc :field-name (if (= ag-type :distinct) :count
                                                ag-type))
                         (assoc :field-display-name (if (= ag-type :distinct) "count"
                                                        (name ag-type)))))]
      (fn [out]
        (trace-lvars "*" out)
        (== out ag-field)))))

(defn- unknown-field° [field-name out]
  (all
   (== out {:base-type    :UnknownField
            :special-type nil
            :field-name   field-name
            :field-display-name field-name})
   (trace-lvars "UNKNOWN FIELD - NOT PRESENT IN EXPANDED QUERY (!)" out)))

(defn- field° [query]
  (let [ag-field°     (aggregate-field° query)
        normal-field° (let [field-name->field (let [fields (flatten-collect-fields query)]
                                                (zipmap (map :field-name fields) fields))]
                        (fn [field-name out]
                          (if-let [field (field-name->field field-name)]
                            (== out field)
                            fail)))]
    (fn [field-name field]
      (conda
        ((normal-field° field-name field))
        ((ag-field° field))))))

(def ^:const ^:private field-groups
  {:breakout        0
   :aggregation     1
   :explicit-fields 2
   :other           3})

(defn- field-group° [query]
  (let [breakout° (breakout-field° query)
        agg°      (aggregate-field° query)
        xfields°  (explicit-fields-field° query)]
    (fn [field out]
      (conda
        ((breakout° field) (== out (field-groups :breakout)))
        ((agg° field)      (== out (field-groups :aggregation)))
        ((xfields° field)  (== out (field-groups :explicit-fields)))
        (s#                (== out (field-groups :other)))))))

(defn- field-position° [field out]
  (featurec field {:position out}))

(def ^:const ^:private special-type-groups
  {:id    0
   :name  1
   :other 2})

(defn- special-type-group° [field out]
  (conda
   ((featurec field {:special-type :id})   (== out (special-type-groups :id)))
   ((featurec field {:special-type :name}) (== out (special-type-groups :name)))
   (s#                                     (== out (special-type-groups :other)))))

(defn- field-name< [query]
  (fn [f1 f2]
    (fresh [name-1 name-2]
      (field-name° f1 name-1)
      (field-name° f2 name-2)
      (matches-seq-order° name-1 name-2 (:result-keys query)))))

(defn- clause-position< [query]
  (let [group°          (field-group° query)
        breakout-fields (flatten-collect-fields (:breakout query))
        fields-fields   (flatten-collect-fields (:fields query))]
    (fn [f1 f2]
      (conda
       ((group° f1 (field-groups :breakout))        (matches-seq-order° f1 f2 breakout-fields))
       ((group° f1 (field-groups :explicit-fields)) (matches-seq-order° f1 f2 fields-fields))))))

(defn- fields-sorted° [query]
  (let [group°      (field-group° query)
        name<       (field-name< query)
        clause-pos< (clause-position< query)]
    (fn [f1 f2]
      (macrolet [(<-or-== [f & ==-clauses] `(conda
                                              ((fresh [v#]
                                                 (~f ~'f1 v#)
                                                 (~f ~'f2 v#)) ~@==-clauses)
                                              ((fresh [v1# v2#]
                                                 (~f ~'f1 v1#)
                                                 (~f ~'f2 v2#)
                                                 (ar/< v1# v2#)) ~'s#)))]
        (<-or-== group°
          (<-or-== field-position°
            (conda
              ((group° f1 (field-groups :other)) (<-or-== special-type-group°
                                                   (name< f1 f2)))
              ((clause-pos< f1 f2)))))))))

(defn- resolve+order-cols [{:keys [result-keys], :as query}]
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

(defn- format-col [col]
  (merge {:description nil
          :id          nil
          :table_id    nil}
         (-> col
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

(defn post-annotate [qp]
  (fn [query]
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
                  (mapv row columns))})))

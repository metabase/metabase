(ns metabase.driver.query-processor.annotate
  (:refer-clojure :exclude [==])
  (:require [clojure.core.logic :refer :all]
            [clojure.core.logic.arithmetic :as ar]
            (clojure [set :as set]
                     [string :as s])
            [metabase.db :refer [sel]]
            [metabase.driver.query-processor.expand :as expand]
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

;;; # ---------------------------------------- FIELD COLLECTION  ----------------------------------------

;; Walk the expanded query and collect the fields found therein. Associate some additional info to each that we'll pass to core.logic so it knows
;; how to order the results

(defn- field-qualify-name [field]
  (assoc field :field-name (apply str (->> (rest (expand/qualified-name-components field))
                                           (interpose ".")))))

(defn- flatten-collect-fields [form]
  (let [fields (transient [])]
    (clojure.walk/prewalk (fn [f]
                            (if-not (= (type f) metabase.driver.query_processor.expand.Field) f
                                    (do
                                      (conj! fields (field-qualify-name f))
                                      ;; HACK !!!
                                      ;; Nested Mongo fields come back inside of their parent when you specify them in the fields clause
                                      ;; e.g. (Q fields venue...name) will return rows like {:venue {:name "Kyle's Low-Carb Grill"}}
                                      ;; Until we fix this the right way we'll just include the parent Field in the :query-fields list so the pattern
                                      ;; matching works correctly.
                                      ;; (This hack was part of the old annotation code too, it just sticks out better because it's no longer hidden amongst the others)
                                      (when (:parent f)
                                        (conj! fields (field-qualify-name (:parent f)))))))
                          form)
    (distinct (persistent! fields))))

(def ^:const ^:private field-groups
  {:breakout        0
   :aggregation     1
   :explicit-fields 2
   :other           3})

(def ^:const ^:private special-type-groups
  {:id    0
   :name  1
   :other 2})

(defn- maybe-create-ag-field [{{ag-type :aggregation-type, ag-field :field} :aggregation}]
  (when (contains? #{:avg :count :distinct :stddev :sum} ag-type)
    [(if (contains? #{:count :distinct} ag-type)
        {:base-type    :IntegerField
         :field-name   "count"
         :special-type :number}
        (-> ag-field
            (select-keys [:base-type :special-type])
            (assoc :field-name (if (= ag-type :distinct) "count"
                                   (name ag-type)))))]))

(defn- query-add-info [query results]
  (let [result-keys (vec (keys (first results)))
        fields      (apply concat (for [[group-name fields] [[:breakout        (flatten-collect-fields (:breakout query))]
                                                             [:aggregation     (maybe-create-ag-field query)]
                                                             [:explicit-fields (when-not (:fields-is-implicit query)
                                                                                 (flatten-collect-fields (:fields query)))]
                                                             [:other           (for [field (sort-by :field-name (flatten-collect-fields query))]
                                                                                 (assoc field :special-type-group (or (special-type-groups (:special-type field))
                                                                                                                      (special-type-groups :other))))]]]
                                    (for [[i field] (map-indexed vector fields)]
                                      (-> field
                                          (assoc :group          (field-groups group-name)
                                                 :group-position i
                                                 :field-name     (keyword (:field-name field)))
                                          (dissoc :parent :parent-id :table-name)))))]
    (assoc query
           :result-keys  result-keys
           :query-fields (sort-by :group (for [k result-keys]
                                           (medley.core/find-first #(= k (:field-name %)) fields))))))


;;; # ---------------------------------------- COLUMN RESOLUTION & ORDERING (CORE.LOGIC)  ----------------------------------------

;; Use core.logic to determine the appropriate

(defn- fieldo [query field]
  (member1o field (:query-fields query)))

(defn- fields< [f1 f2]
  (fresh [g1 g2, gp1 gp2]
    (featurec f1 {:group g1, :group-position gp1})
    (featurec f2 {:group g2, :group-position gp2})
    (conda
     ((ar/< g1 g2))
     ((== g1 g2) (conda
                  ((!= g1 (field-groups :other)) (ar/< gp1 gp2))
                  ((== g1 (field-groups :other)) (fresh [p1 p2, t1 t2]
                                                   (featurec f1 {:position p1, :special-type-group t1})
                                                   (featurec f2 {:position p2, :special-type-group t2})
                                                   (conda
                                                    ((ar/< p1 p2))
                                                    ((== p1 p2) (conda
                                                                 ((ar/< t1 t2))
                                                                 ((== t1 t2) (ar/< gp1 gp2))))))))))))

(defn- sorted-intoo [pred l v out]
  (matche [l]
    ([[]]           (== out [v]))
    ([[?x . ?more]] (conda
                     ((pred v ?x) (== out (lcons v (lcons ?x ?more)))) ; TODO - binary search would be faster :sunglasses:
                     (s#          (fresh [more]
                                    (sorted-intoo pred ?more v more)
                                    (== out (lcons ?x more))))))))

(defn- sorted-permutationo [pred l out]
  (matche [l]
    ([[]]           (== out []))
    ([[?x . ?more]] (fresh [more]
                      (sorted-permutationo pred ?more more)
                      (sorted-intoo pred more ?x out)))))

(defn- resolve+order-cols [query]
  {:post [(sequential? %) (every? map? %)]}
  (time (first (run 1 [q]
                 ;; TODO - this is effectively just a complicated way of doing a sort at this point
                 ;; Move the "additional info" stuff back to core.logic
                 ;; there's not much of a point using core.logic here
                 (sorted-permutationo fields< (query :query-fields) q)))))


;;; # ---------------------------------------- COLUMN DETAILS  ----------------------------------------

;; Format the results in the way the front-end expects.

(defn- format-col [col]
  (merge {:description nil
          :id          nil
          :table_id    nil}
         (-> col
             (set/rename-keys  {:base-type    :base_type
                                :field-id     :id
                                :field-name   :name
                                :special-type :special_type
                                :table-id     :table_id})
             (dissoc :position :group :group-position :special-type-group))))

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
                                  (sel :many :id->fields [Field :id :name :table_id :description :base_type :special_type], :id [in (vals field-id->dest-field-id)]))]

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
          cols    (->> (query-add-info (:query query) results)
                       resolve+order-cols
                       (map format-col)
                       add-fields-extra-info)
          columns (map :name cols)]
      {:cols    (vec (for [col cols]
                       (update col :name name)))
       :columns (mapv name columns)
       :rows    (for [row results]
                  (mapv row columns))})))

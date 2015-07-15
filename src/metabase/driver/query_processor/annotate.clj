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
    (-> (if (contains? #{:count :distinct} ag-type)
          {:base-type    :IntegerField
           :field-name   "count"
           :special-type :number}
          (-> ag-field
              (select-keys [:base-type :special-type])
              (assoc :field-name (if (= ag-type :distinct) "count"
                                     (name ag-type)))))
        (assoc :group (field-groups :aggregation)))))

(defn- query-add-info [query results]
  (let [result-keys (vec (keys (first results)))
        fields      (for [field (concat (for [[i f] (map-indexed vector (flatten-collect-fields (:breakout query)))]
                                          (assoc f :group          (field-groups :breakout)
                                                   :group-position i))
                                        (for [[i f] (map-indexed vector [(maybe-create-ag-field query)])]
                                          (assoc f :group          (field-groups :aggregation)
                                                   :group-position i))
                                        (for [[i f] (map-indexed vector (when-not (:fields-is-implicit query)
                                                                          (flatten-collect-fields (:fields query))))]
                                          (assoc f :group          (field-groups :explicit-fields)
                                                   :group-position i))
                                        (for [[i {:keys [position special-type], :as f}] (map-indexed vector (sort-by :field-name (flatten-collect-fields query)))]
                                          (assoc f :group          (field-groups :other)
                                                   :group-position (+ (* 1000 position)
                                                                      (* 100  (or (special-type-groups special-type)
                                                                                  (special-type-groups :other)))
                                                                      i))))]
                      (-> field
                          (assoc :field-name (keyword (:field-name field)))
                          (dissoc :parent :parent-id :table-name)))]
    (assoc query
           :result-keys  result-keys
           :query-fields (sort-by :group (for [k result-keys]
                                           (medley.core/find-first #(= k (:field-name %)) fields))))))


;;; # ---------------------------------------- COLUMN RESOLUTION & ORDERING (CORE.LOGIC)  ----------------------------------------

;; Use core.logic to determine the appropriate

(defn- fieldo [query field]
  (member1o field (:query-fields query)))

(defn- fields< [query f1 f2]
  (fresh [group-1 group-2, group-position-1 group-position-2]
    (featurec f1 {:group group-1, :group-position group-position-1})
    (featurec f2 {:group group-2, :group-position group-position-2})
    (conda
     ((ar/< group-1 group-2))
     ((== group-1 group-2) (ar/< group-position-1 group-position-2)))))

(defn- resolve+order-cols [query]
  {:post [(sequential? %) (every? map? %)]}
  (let [num-cols   (count (:result-keys query))
        cols       (vec (lvars num-cols))]
    (first (run 1 [q]
             (== q cols)
             (distincto cols)
             (fieldo query (cols 0))
             (everyg (fn [i]
                       (all (fieldo query (cols (inc i)))
                            (fields< query (cols i) (cols (inc i)))))
                     (range 0 (dec num-cols)))))))


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
             (dissoc :position :group :group-position))))

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

;; (require 'metabase.driver)
;; (require 'metabase.test.data)
;; (require 'metabase.test.data.datasets)
;; (defn x []
;;   (metabase.test.data.datasets/with-dataset
;;     :postgres
;;     (metabase.driver/process-query
;;      {:type :query,
;;       :database (metabase.test.data/db-id),
;;       :query
;;       {:source_table (metabase.test.data/id :venues),
;;        :filter
;;        ["INSIDE"
;;         (metabase.test.data/id :venues :latitude)
;;         (metabase.test.data/id :venues :longitude)
;;         10.0649
;;         -165.379
;;         10.0641
;;         -165.371],
;;        :aggregation ["rows"],
;;        :breakout [nil],
;;        :limit nil}})))

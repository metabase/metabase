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

;;; # ---------------------------------------- QUERY DICT ADDITIONAL INFO  ----------------------------------------

(defn- collapse-field [field]
  (into {} (-> field
               (assoc :field-name (->> (rest (expand/qualified-name-components field))
                                       (interpose ".")
                                       (apply str)
                                       keyword))
               (dissoc :parent :parent-id :table-name))))

(defn- query-add-info [query results]
  {:pre [(integer? (get-in query [:source-table :id]))]}
  (let [fields (transient [])]
    (clojure.walk/prewalk (fn [f]
                            (if-not (= (type f) metabase.driver.query_processor.expand.Field) f
                                    (conj! fields f)))
                          query)
    (assoc query
           :result-keys  (vec (keys (first results)))
           :query-fields (mapv collapse-field (persistent! fields))
           :fields       (mapv collapse-field (:fields query))
           :breakout     (mapv collapse-field (:breakout query)))))


;;; # ---------------------------------------- COLUMN RESOLUTION & ORDERING  ----------------------------------------

(defn- breakout-fieldo [{breakout-fields :breakout} field]
  (membero field breakout-fields))

(defn- explicit-fields-fieldo [{:keys [fields-is-implicit], fields-fields :fields} field]
  (all (nilo fields-is-implicit)
       (membero field fields-fields)))

(defn- aggregate-fieldo [{{ag-type :aggregation-type, ag-field :field} :aggregation} field]
  (all (membero ag-type [:count :avg :sum :stddev :distinct])
       (== field (if (contains? #{:count :distinct} ag-type)
                   {:base-type    :IntegerField
                    :field-name   :count
                    :special-type :number}
                   (-> ag-field
                       (select-keys [:base-type :special-type])
                       (assoc :field-name (if (= ag-type :distinct) :count
                                              ag-type)))))))

(defn- valid-nameo [{:keys [result-keys]} field]
  (fresh [field-name]
    (featurec field {:field-name field-name})
    (membero field-name result-keys)))

(defn- fieldo [{:keys [query-fields], :as query} field]
  (all (conde
        ((aggregate-fieldo query field))
        ((membero field query-fields)))
       (valid-nameo query field)))


;;; ## Ordering

(defn- matches-sort-sequenceo [l [k & more-keys]]
  (conda
   ((emptyo l))
   (s#        (if-not k
                fail
                (fresh [v1 v2 more-vals]
                  (conso v1 more-vals l)
                  (conde
                   ((== k v1)             (matches-sort-sequenceo more-vals more-keys))
                   ((firsto more-vals v2) (== k v2) fail)
                   (s#                    (matches-sort-sequenceo l more-keys))))))))

(defn- field-positiono [field v]
  (featurec field {:position v}))

(defn- fields-sorted-by-nameo [{:keys [result-keys]} f1 f2]
  (fresh [n1 n2 n1+n2]
    (featurec f1 {:field-name n1})
    (featurec f2 {:field-name n2})
    (matches-sort-sequenceo [n1 n2] (sort result-keys))))

(defn- field-groupo [query field v]
  (conda
   ((breakout-fieldo query field)        (== v 0))
   ((aggregate-fieldo query field)       (== v 1))
   ((explicit-fields-fieldo query field) (== v 2))
   (s#                                   (== v 3))))

(defn special-type-groupo [field v]
  (fresh [t]
    (featurec field {:special-type t})
    (conda
     ((== t :id)   (== v 0))
     ((== t :name) (== v 1))
     (s#           (== v 2)))))

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
(defn- fields-sortedo [query f1 f2]
  (fresh [g1 g2]
    (field-groupo query f1 g1)
    (field-groupo query f2 g2)
    (conda
     ((ar/< g1 g2))
     ((== g1 g2) (conda
                  ((== g1 0) (matches-sort-sequenceo [f1 f2] (:breakout query)))
                  ((== g1 2) (matches-sort-sequenceo [f1 f2] (:fields query)))
                  ((== g2 3) (fresh [pos1 pos2]
                               (field-positiono f1 pos1)
                               (field-positiono f2 pos2)
                               (conda
                                ((ar/< pos1 pos2))
                                ((== pos1 pos2) (fresh [t1 t2]
                                                  (special-type-groupo f1 t1)
                                                  (special-type-groupo f2 t2)
                                                  (conda ((ar/< t1 t2))
                                                         ((== t1 t2) (fields-sorted-by-nameo query f1 f2)))))))))))))


;;; ## Top-Level Resolution / Ordering

(defn- resolve+order-cols [query]
  {:post [(or (sequential? %)
              (println "FAILED!\n" (u/pprint-to-str query) "\nRESULTS:" %))
          (every? map? %)]}
  (let [num-cols (count (:result-keys query))
        cols     (vec (lvars num-cols))]
    (first (run 1 [q]
             (== q cols)
             (distincto q)
             (everyg (partial fieldo query) q)
             (everyg (fn [i]
                       (fields-sortedo query (cols i) (cols (inc i))))
                     (range 0 (dec num-cols)))))))


;;; # ---------------------------------------- COLUMN DETAILS  ----------------------------------------


(defn- format-col [col]
  (let [defaults {:description nil
                  :id          nil
                  :table_id    nil}]
    (merge defaults
           (-> col
               (set/rename-keys  {:base-type    :base_type
                                  :field-id     :id
                                  :field-name   :name
                                  :special-type :special_type
                                  :table-id     :table_id})
               (dissoc :parent :parent-id :position)))))

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
          cols    (time (->> (query-add-info (:query query) results)
                             resolve+order-cols
                             (map format-col)
                             add-fields-extra-info))
          columns (map :name cols)]
      {:cols    (vec (for [col cols]
                       (update col :name name)))
       :columns (mapv name columns)
       :rows    (for [row results]
                  (mapv row columns))})))

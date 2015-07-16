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
  (assoc field :field-name (keyword (apply str (->> (rest (expand/qualified-name-components field))
                                                    (interpose "."))))))

(defn- flatten-collect-fields [form]
  (let [fields (transient [])]
    (clojure.walk/prewalk (fn [f]
                            (if-not (= (type f) metabase.driver.query_processor.expand.Field) f
                                    (do
                                      (conj! fields f)
                                      ;; HACK !!!
                                      ;; Nested Mongo fields come back inside of their parent when you specify them in the fields clause
                                      ;; e.g. (Q fields venue...name) will return rows like {:venue {:name "Kyle's Low-Carb Grill"}}
                                      ;; Until we fix this the right way we'll just include the parent Field in the :query-fields list so the pattern
                                      ;; matching works correctly.
                                      ;; (This hack was part of the old annotation code too, it just sticks out better because it's no longer hidden amongst the others)
                                      (when (:parent f)
                                        (conj! fields (:parent f))))))
                          form)
    (->> (persistent! fields)
         distinct
         (map field-qualify-name)
         (mapv (partial into {})))))


;;; # ---------------------------------------- COLUMN RESOLUTION & ORDERING (CORE.LOGIC)  ----------------------------------------

;; Use core.logic to determine the appropriate ordering / result Fields

(defn- breakout-fieldo [{:keys [breakout]}]
  (let [breakout-fields (flatten-collect-fields breakout)]
    (fn [out]
      (membero out breakout-fields))))

(defn- aggregate-fieldo [{{ag-type :aggregation-type, ag-field :field} :aggregation}]
  (if-not (contains? #{:avg :count :distinct :stddev :sum} ag-type)
    (constantly fail)
    (let [^:const ag-field (if (contains? #{:count :distinct} ag-type)
                             {:base-type    :IntegerField
                              :field-name   "count"
                              :special-type :number}
                             (-> ag-field
                                 (select-keys [:base-type :special-type])
                                 (assoc :field-name (if (= ag-type :distinct) "count"
                                                        (name ag-type)))))]
      (fn [out]
        (== out aggregate-fieldo)))))

(defn- explicit-fields-fieldo [{:keys [fields-is-implicit fields]}]
  (if-not fields-is-implicit
    (constantly fail)
    (let [fields-fields (flatten-collect-fields fields)]
      (fn [out]
        (membero out fields-fields)))))

(defn- fieldo [query]
  (let [fields    (flatten-collect-fields query)
        ag-fieldo (aggregate-fieldo query)]
    (fn [out]
      (conde
       ((membero out fields))
       ((ag-fieldo out))))))

(def ^:const ^:private field-groups
  {:breakout        0
   :aggregation     1
   :explicit-fields 2
   :other           3})

(defn- field-groupo [query]
  (let [breakouto (breakout-fieldo query)
        aggo      (aggregate-fieldo query)
        xfieldso  (explicit-fields-fieldo query)]
    (fn [field out]
      (conda
       ((breakouto field) (== out (field-groups :breakout)))
       ((aggo field)      (== out (field-groups :aggregation)))
       ((xfieldso field)  (== out (field-groups :explicit-fields)))
       (s#                (== out (field-groups :other)))))))

(defn- positiono [field out]
  (featurec field {:position out}))

(def ^:const ^:private special-type-groups
  {:id    0
   :name  1
   :other 2})

(defn- special-typeo [field out]
  (fresh [special-type]
    (featurec field {:special-type special-type})
    (conda
     ((== special-type :id)   (== out (special-type-groups :id)))
     ((== special-type :name) (== out (special-type-groups :name)))
     (s#                      (== out (special-type-groups :other))))))

(defn- field-name< [query]
  (fn [f1 f2]
    (fresh [name-1 name-2]
      (featurec f1 {:field-name name-1})
      (featurec f2 {:field-name name-2})
      ((fn name< [[k & more]]
         (conda
          ((== k name-1) s#)
          ((!= k name-2) (when (seq more)
                           (name< more))))) (:result-keys query)))))

(defn- clause-position< [query]
  (let [groupo          (field-groupo query)
        breakout-fields (flatten-collect-fields (:breakout query))
        fields-fields   (flatten-collect-fields (:fields query))]
  (fn [f1 f2]
    (fresh [field-group]
      (groupo f1 field-group)
      (conda
       ((== field-group (field-groups :breakout)) (matches-seq-ordero f1 f2 breakout-fields))
       (s#                                        (matches-seq-ordero f1 f2 fields-fields)))))))

(defn- ar-< [x y]
  (ar/< x y))

(defn- fields< [query]
  (let [groupo      (field-groupo query)
        name<       (field-name< query)
        clause-pos< (clause-position< query)]
    (fn [f1 f2]
      (all
       (trace-lvars "*" f1 f2)
       (fpred-conda [groupo f1 f2]
         (ar-< (do (println "SORTED BECAUSE GROUP <") s#))
         (==  (fpred-conda [positiono f1 f2]
                (ar-< (do (println "SORTED BECAUSE POSITION <") s#))
                (== (fresh [group]
                      (groupo f1 group)
                      (conda
                       ((== group (field-groups :other)) (fpred-conda [special-typeo f1 f2]
                                                           (ar-< (do (println "SORTED BECAUSE SPECIAL TYPE GROUP <") s#))
                                                           (== (name< f1 f2) (do (println "SORTED BECAUSE NAME <") s#))))
                       (s#                               (clause-pos< f1 f2) (do (println "SORTED BECAUSE CLAUSE POS <") s#))))))))))))

(defn- resolve+order-cols [{:keys [result-keys], :as query}]
  {:post [(sequential? %) (every? map? %)]}
  (time (first (let [fields (vec (lvars (count result-keys)))]
                 (run 1 [q]
                   ;; Make a new constraint for every lvar FIELDS[i] to give it the name of RESULT-KEYS[i]
                   (everyg (fn [i]
                             (featurec (fields i) {:field-name (result-keys i)}))
                           (range 0 (count result-keys)))
                   (everyg (fieldo query) fields)
                   (sorted-permutationo (fields< query) fields q))))))

(defn x []
  (require 'metabase.driver 'metabase.test.data)
  (@(ns-resolve 'metabase.driver 'process-query)
   {:type     :query,
    :database (@(ns-resolve 'metabase.test.data 'db-id)),
    :query    {:source_table (@(ns-resolve 'metabase.test.data 'id) :venues),
               :filter       nil,
               :aggregation  ["rows"],
               :breakout     [nil],
               :limit        10,
               :order_by     [[(@(ns-resolve 'metabase.test.data 'id) :venues :id) "ascending"]]}}))


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

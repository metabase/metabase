(ns metabase.warehouse-schema.models.field-derived-types-test
  "The coercion strategy and effective type that an update of a Field derives are written by its before-update hook as
  expressions the database evaluates against the stored rows. Every combination of stored values and of changes gives
  what the Clojure derivation gives, through one multi-row `t2/update!`."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field :as field]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private published (atom []))

(events/derive! :event/field-update ::published)

(methodical/defmethod events/publish-event! ::published
  [topic event]
  (swap! published conj [topic event]))

(def ^:private stored-bases ["type/Text" "type/Integer"])
(def ^:private stored-strategies [nil "Coercion/String->Integer" "Coercion/UNIXSeconds->DateTime" "Coercion/Bogus"])
(def ^:private stored-effective-types [nil "type/Text" "type/Integer" "type/Instant" "type/Bogus"])

(def ^:private change-sets
  [{:base_type :type/Text}
   {:base_type :type/Integer}
   {:base_type :type/Float}
   {:coercion_strategy nil}
   {:coercion_strategy :Coercion/String->Integer}
   {:coercion_strategy :Coercion/UNIXSeconds->DateTime}
   {:effective_type :type/Float}
   {:description "changed"}
   {:base_type :type/Integer :effective_type :type/Text}
   {:base_type :type/Text :coercion_strategy nil}
   {:coercion_strategy :Coercion/String->Integer :effective_type :type/Text}
   {:base_type :type/Integer :description "d" :caveats "c" :points_of_interest "p" :display_name "D" :database_type "BIGINT"
    :database_position 5 :preview_display false :visibility_type :details-only :has_field_values :list}])

(defn- normalized [v]
  (if (keyword? v) (u/qualified-name v) v))

(defn- raw-types
  "The stored `[base_type coercion_strategy effective_type]` of the Field with `id`, as strings."
  [id]
  (let [row (first (t2/query {:select [:base_type :coercion_strategy :effective_type] :from [:metabase_field] :where [:= :id id]}))]
    (mapv row [:base_type :coercion_strategy :effective_type])))

(defn- insert-with-types!
  "A Field of `table-id` with the raw stored types, which no transform would let through."
  [table-id n [base strategy effective]]
  (let [id (t2/insert-returning-pk! :model/Field {:table_id table-id :name (str "F" n) :base_type :type/Text
                                                  :database_type "TEXT" :position 0})]
    (t2/query-one {:update :metabase_field
                   :set    {:base_type base :coercion_strategy strategy :effective_type effective}
                   :where  [:= :id id]})
    id))

(defn- expected-types
  "What the Clojure derivation leaves stored in a Field holding `stored` types after `changes`."
  [[base strategy effective] changes]
  (let [stored  {:base_type base :coercion_strategy strategy :effective_type effective}
        derived (#'field/with-derived-types stored (assoc changes :id 1))
        final   (merge stored derived)]
    (mapv (comp normalized final) [:base_type :coercion_strategy :effective_type])))

(defn- untouched-by?
  "Whether no column `changes` write holds its new value in the stored types, as Toucan reads them: a strategy it does
  not take reads as nil, so that clearing one is no change to a row that holds it. On MySQL and MariaDB an update of
  more than 8 columns cannot keep the order of its assignments, so a strategy cleared by a new base type next to a
  missing or invalid effective type, which the effective type's expression can then no longer tell from no strategy, is
  left out."
  [changes [base strategy effective]]
  (let [stored {:base_type base :coercion_strategy strategy :effective_type effective}]
    (and
     (not (and (contains? changes :coercion_strategy) (nil? (:coercion_strategy changes)) (= "Coercion/Bogus" strategy)))
     (not (and (= :mysql (mdb/db-type))
               (> (count changes) 8)
               (contains? changes :base_type)
               (some? strategy)
               (not (contains? #{"type/Text" "type/Integer"} effective))))
     (not-any? (fn [[k v]] (= (normalized v) (get stored k ::absent))) (select-keys changes [:base_type :coercion_strategy :effective_type])))))

(deftest hook-expressions-equal-the-clojure-derivation-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table {table-id :id} {:db_id db-id}]
    (doseq [changes change-sets
            :let    [states (filter #(untouched-by? changes %)
                                    (for [b stored-bases, s stored-strategies, e stored-effective-types] [b s e]))
                     ids    (vec (map-indexed #(insert-with-types! table-id %1 %2) states))]
            :when   (seq ids)]
      (testing (pr-str changes)
        (t2/update! :model/Field :id [:in ids] changes)
        (doseq [[id state] (map vector ids states)]
          (is (= (expected-types state changes) (raw-types id))
              (str "stored " (pr-str state))))
        (t2/delete! :model/Field :id [:in ids])))))

(deftest hook-expressions-through-the-write-function-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table {table-id :id} {:db_id db-id}]
    (let [states [["type/Text" "Coercion/UNIXSeconds->DateTime" "type/Instant"]
                  ["type/Text" nil "type/Integer"]
                  ["type/Text" "Coercion/String->Integer" nil]
                  ["type/Text" nil nil]]
          ids    (vec (map-indexed #(insert-with-types! table-id %1 %2) states))]
      (field/update-fields! ids {:base_type :type/Integer :description "d"})
      (doseq [[id state] (map vector ids states)]
        (is (= (expected-types state {:base_type :type/Integer :description "d"}) (raw-types id))
            (str "stored " (pr-str state)))))))

(deftest statement-count-does-not-grow-test
  (testing "an update of many Fields in different stored states costs the statements of one"
    (let [counted (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}
                                   :model/Table {table-id :id} {:db_id db-id}]
                      (let [states (take n (cycle [["type/Text" "Coercion/UNIXSeconds->DateTime" "type/Instant"]
                                                   ["type/Text" nil "type/Integer"]
                                                   ["type/Text" nil "type/Text"]]))
                            ids    (vec (map-indexed #(insert-with-types! table-id %1 %2) states))]
                        (events.tu/statement-count! #(field/update-fields! ids {:base_type :type/Float :description "d"})))))]
      (counted 1)
      (is (= (counted 2) (counted 6))))))

(deftest events-carry-stored-values-test
  (testing "the event of an update carries the Field as stored, not an expression"
    (do
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id}]
        (let [[id] [(insert-with-types! table-id 0 ["type/Text" "Coercion/UNIXSeconds->DateTime" "type/Instant"])]]
          (reset! published [])
          (field/update-fields! [id] {:base_type :type/Float})
          (let [objects (->> @published (filter #(= :event/field-update (first %))) first second :changes (map :object))]
            (is (seq objects))
            (is (every? #(not-any? vector? (vals %)) objects))
            (is (= (t2/select-one-fn :effective_type :model/Field :id id) (:effective_type (first objects))))))))))

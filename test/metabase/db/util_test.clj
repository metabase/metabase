(ns metabase.db.util-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.db.util :as mdb.u]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :refer [FieldValues]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest idempotent-insert!-test
  ;; We cannot use with-temp, as it starts its own transaction, which stops us setting the isolation level.
  (let [field-name "test-field"
        v-field-id (volatile! nil)]
    (try
      ;; ensure there is no database detritus
      (t2/delete! Field :name field-name)

      (let [threads    5
            promises   (atom [])
            field-args [:name field-name :base_type :type/Text :table_id 1 :database_type "TEXT"]
            field-id   (u/prog1 (apply t2/insert-returning-pk! Field field-args) (vreset! v-field-id <>))
            args       [:field_id field-id :type :linked-filter :hash_key "1234"]
            thunk      (fn []
                         (mdb.u/idempotent-insert!
                           (:id (apply t2/select-one FieldValues args))
                           ;; Pause to ensure multiple threads hit the mutating path
                           (do (Thread/sleep 300)
                               (apply t2/insert-returning-pk! FieldValues args))))]

        ;; hit it
        (dotimes [_ threads]
          (swap! promises conj (future (thunk))))

        ;; This assertion must come first so that be block on the promises
        (testing "Every call returns the same row"
          (let [id (:id (apply t2/select-one FieldValues args))]
            (is (= (repeat threads id)
                   (map (comp :id deref) @promises)))))

        (testing "We have not inserted any duplicates"
          (is (= 1 (count (apply t2/select FieldValues args)))))

        (testing "Later calls will just return the existing row as well"
          (is (= (:id (apply t2/select-one FieldValues args)) (thunk))))
        )
      ;; Since we couldn't use with-temp, we need to clean up manually.
      (finally
        (when-let [field-id @v-field-id]
          (t2/delete! FieldValues :field_id field-id)
          (t2/delete! Field :id field-id))))))

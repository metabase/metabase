(ns metabase.events.single-row-write-counts-test
  "The number of app-DB statements of the write functions that publish their events by hand, which includes the one
  read of the previous rows that the event needs, does not grow with the rows of a call."
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.models.measure :as measure]
   [metabase.segments.models.segment :as segment]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.transform :as transform]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest segment-update-statement-counts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment {s1 :id} {}
                   :model/Segment {s2 :id} {}
                   :model/Segment {s3 :id} {}
                   :model/Segment {s4 :id} {}
                   :model/Segment {s5 :id} {}
                   :model/Segment {s6 :id} {}]
      (let [ids [s1 s2 s3 s4 s5 s6]]
        (testing "without a definition"
          (let [counted (fn [n]
                          (events.tu/statement-count!
                           #(segment/update-segments! (mapv (fn [id] {:id id :name (str "Renamed " n)}) (take n ids)))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))
        (testing "with a definition"
          (let [mp      (mt/metadata-provider)
                counted (fn [n total]
                          (let [definition (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                       (lib/> (lib.metadata/field mp (mt/id :orders :total)) total))]
                            (events.tu/statement-count!
                             #(segment/update-segments! (mapv (fn [id] {:id id :definition definition}) (take n ids))))))]
            (counted 6 1)
            (is (= (counted 2 2) (counted 6 3)))))
        (testing "with a definition on the table that some of the segments are already on"
          (let [mp        (mt/metadata-provider)
                on-orders (fn [total]
                            (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                        (lib/> (lib.metadata/field mp (mt/id :orders :total)) total)))
                on-venues (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                      (lib/= (lib.metadata/field mp (mt/id :venues :price)) 1))
                counted   (fn [n total]
                            (segment/update-segments! (mapv (fn [id] {:id id :definition on-venues}) (take n ids)))
                            (let [definition (on-orders total)]
                              (segment/update-segments! (mapv (fn [id] {:id id :definition definition}) (take-nth 2 (take n ids)))))
                            (let [definition (on-orders (inc total))
                                  rows       (mapv (fn [id] {:id id :definition definition}) (take n ids))]
                              (events.tu/statement-count! #(segment/update-segments! rows))))]
            (counted 6 10)
            (is (= (counted 2 20) (counted 6 30)))
            (testing "every segment is on the table of its new definition"
              (is (= #{(mt/id :orders)} (t2/select-fn-set :table_id :model/Segment :id [:in ids]))))))))))

(deftest measure-write-statement-counts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Measure {m1 :id} {}
                   :model/Measure {m2 :id} {}
                   :model/Measure {m3 :id} {}
                   :model/Measure {m4 :id} {}
                   :model/Measure {m5 :id} {}
                   :model/Measure {m6 :id} {}]
      (let [ids [m1 m2 m3 m4 m5 m6]]
        (testing "an update without a definition"
          (let [counted (fn [n]
                          (events.tu/statement-count!
                           #(measure/update-measures! (mapv (fn [id] {:id id :name (str "Renamed " n)}) (take n ids)))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))
        (testing "an update with a definition"
          (let [mp      (mt/metadata-provider)
                orders  (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                counted (fn [n column]
                          (let [definition (lib/aggregate orders (lib/sum (lib.metadata/field mp (mt/id :orders column))))]
                            (events.tu/statement-count!
                             #(measure/update-measures! (mapv (fn [id] {:id id :definition definition}) (take n ids))))))]
            (counted 6 :total)
            (is (= (counted 2 :subtotal) (counted 6 :tax)))))
        (testing "an update with a definition on the table that some of the measures are already on"
          (let [mp        (mt/metadata-provider)
                on-orders (fn [column]
                            (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                           (lib/sum (lib.metadata/field mp (mt/id :orders column)))))
                on-venues (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                         (lib/sum (lib.metadata/field mp (mt/id :venues :price))))
                counted   (fn [n column]
                            (measure/update-measures! (mapv (fn [id] {:id id :definition on-venues}) (take n ids)))
                            (let [definition (on-orders :total)]
                              (measure/update-measures! (mapv (fn [id] {:id id :definition definition}) (take-nth 2 (take n ids)))))
                            (let [definition (on-orders column)
                                  rows       (mapv (fn [id] {:id id :definition definition}) (take n ids))]
                              (events.tu/statement-count! #(measure/update-measures! rows))))]
            (counted 6 :subtotal)
            (is (= (counted 2 :tax) (counted 6 :discount)))
            (testing "every measure is on the table of its new definition"
              (is (= #{(mt/id :orders)} (t2/select-fn-set :table_id :model/Measure :id [:in ids]))))))
        (testing "setting the dimensions"
          (let [counted (fn [n]
                          (events.tu/statement-count!
                           #(measure/set-measure-dimensions! m1
                                                             (mapv (fn [i] {:id (format "00000000-0000-4000-8000-%012d" i)}) (range n))
                                                             [])))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))

(deftest transform-write-statement-counts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform {t1 :id} {}
                   :model/Transform {t2 :id} {}
                   :model/Transform {t3 :id} {}
                   :model/Transform {t4 :id} {}
                   :model/Transform {t5 :id} {}
                   :model/Transform {t6 :id} {}]
      (testing "a transform update"
        (let [counted (fn [n]
                        (events.tu/statement-count!
                         #(transform/update-transforms! (mapv (fn [id] {:id id :description (str "Described " n)}) (take n [t1 t2 t3 t4 t5 t6])))))]
          (counted 1)
          (is (= (counted 2) (counted 6))))))))

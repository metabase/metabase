(ns dev.model-tracking-test
  (:require
   [clojure.test :refer :all]
   [dev.model-tracking :as model-tracking]
   [metabase.models :refer [Collection]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (model-tracking/untrack-all!)
                      (thunk)))

(deftest e2e-test
  (mt/with-model-cleanup [Collection]
    ;; setup
    (model-tracking/track! 'Collection)

    (testing "insert"
      (t2/insert! Collection {:name "Test tracking" :color "#000000"})
      (testing "should be tracked"
        (is (=? [{:name  "Test tracking"
                  :color "#000000"}]
                (get-in (model-tracking/changes) [:collection :insert]))))
      (testing "should take affects"
        (is (= 1 (t2/count Collection :name "Test tracking")))))

    (testing "update"
      (t2/update! Collection {:name "Test tracking"} {:color "#ffffff"})
      (testing "changes should be tracked"
        (is (= [{:color "#ffffff"}]
               (get-in (model-tracking/changes) [:collection :update]))))
      (testing "should take affects"
        (is (= "#ffffff" (t2/select-one-fn :color Collection :name "Test tracking")))))

    (testing "delete"
      (let [coll-id (t2/select-one-pk Collection :name "Test tracking")]
        (t2/delete! Collection coll-id)
        (testing "should be tracked"
          (is (=? [{:color "#ffffff"
                    :name  "Test tracking",
                    :id    coll-id}]
                  (get-in (model-tracking/changes) [:collection :delete]))))
        (testing "should take affects"
          (is (nil? (t2/select-one Collection :id coll-id))))))

    (testing "untrack should stop all tracking for"
      (model-tracking/untrack-all!)
      (testing "insert"
        (t2/insert! Collection {:name "Test tracking" :color "#000000"})
        (testing "changes not should be tracked"
          (is (empty? (model-tracking/changes))))
        (testing "should take affects"
          (is (= 1 (t2/count Collection :name "Test tracking")))))

      (testing "update"
        (t2/update! Collection {:name "Test tracking"} {:color "#ffffff"})
        (testing "changes not should be tracked"
          (is (empty? (model-tracking/changes))))
        (testing "should take affects"
          (is (= "#ffffff" (t2/select-one-fn :color Collection :name "Test tracking")))))

      (testing "delete"
        (let [coll-id (t2/select-one-pk Collection :name "Test tracking")]
          (t2/delete! Collection coll-id)
          (testing "changes not should be tracked"
            (is (empty? (model-tracking/changes))))
          (testing "should take affects"
            (is (nil? (t2/select-one Collection :id coll-id)))))))))

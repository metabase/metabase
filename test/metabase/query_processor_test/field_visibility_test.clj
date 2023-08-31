(ns metabase.query-processor-test.field-visibility-test
  "Tests for behavior of fields with different visibility settings."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.models.field :refer [Field]]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]))

;; make sure that rows where visibility_type = details-only are included and properly marked up
(defn- venues-cols-from-query []
  (-> (mt/run-mbql-query venues
        {:order-by [[:asc $id]]
         :limit    1})
      mt/cols
      set))

(deftest details-only-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "sanity check -- everything should be returned before making changes"
      (is (=? (m/index-by :id (qp.test-util/expected-cols :venues))
              (m/index-by :id (venues-cols-from-query)))))

    (testing ":details-only fields should not be returned in normal queries"
      (tu/with-temp-vals-in-db Field (mt/id :venues :price) {:visibility_type :details-only}
        (is (=? (m/index-by :id (for [col (qp.test-util/expected-cols :venues)]
                                  (if (= (mt/id :venues :price) (u/the-id col))
                                    (assoc col :visibility_type :details-only)
                                    col)))
                (m/index-by :id (venues-cols-from-query))))))))

(deftest ^:parallel sensitive-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Make sure :sensitive information fields are never returned by the QP"
      (is (=? {:cols (qp.test-util/expected-cols :users [:id :name :last_login])
               :rows [[ 1 "Plato Yeshua"]
                      [ 2 "Felipinho Asklepios"]
                      [ 3 "Kaneonuskatew Eiran"]
                      [ 4 "Simcha Yan"]
                      [ 5 "Quentin Sören"]
                      [ 6 "Shad Ferdynand"]
                      [ 7 "Conchúr Tihomir"]
                      [ 8 "Szymon Theutrich"]
                      [ 9 "Nils Gotam"]
                      [10 "Frans Hevel"]
                      [11 "Spiros Teofil"]
                      [12 "Kfir Caj"]
                      [13 "Dwight Gresham"]
                      [14 "Broen Olujimi"]
                      [15 "Rüstem Hebel"]]}
              ;; Filter out the timestamps from the results since they're hard to test :/
              (mt/format-rows-by [int identity]
                (qp.test-util/rows-and-cols
                 (mt/run-mbql-query users
                   {:order-by [[:asc $id]]}))))))))

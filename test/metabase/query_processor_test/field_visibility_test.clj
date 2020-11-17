(ns metabase.query-processor-test.field-visibility-test
  "Tests for behavior of fields with different visibility settings."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.models.field :refer [Field]]
            [metabase.test.util :as tu]))

;;; ---------------------------------------------- :details-only fields ----------------------------------------------

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
      (is (= (u/key-by :id (qp.test/expected-cols :venues))
             (u/key-by :id (venues-cols-from-query)))))

    (testing ":details-only fields should not be returned in normal queries"
      (tu/with-temp-vals-in-db Field (mt/id :venues :price) {:visibility_type :details-only}
        (is (= (u/key-by :id (for [col (qp.test/expected-cols :venues)]
                               (if (= (mt/id :venues :price) (u/get-id col))
                                 (assoc col :visibility_type :details-only)
                                 col)))
               (u/key-by :id (venues-cols-from-query))))))))


;;; ----------------------------------------------- :sensitive fields ------------------------------------------------

(deftest sensitive-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Make sure :sensitive information fields are never returned by the QP"
      (is (= {:cols (qp.test/expected-cols :users [:id :name :last_login])
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
               (qp.test/rows-and-cols
                 (mt/run-mbql-query users
                   {:order-by [[:asc $id]]}))))))))

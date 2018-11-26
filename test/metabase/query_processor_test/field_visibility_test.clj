(ns metabase.query-processor-test.field-visibility-test
  "Tests for behavior of fields with different visibility settings."
  (:require [metabase
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.models.field :refer [Field]]
            [metabase.test
             [data :as data]
             [util :as tu]]))

;;; ---------------------------------------------- :details-only fields ----------------------------------------------

;; make sure that rows where visibility_type = details-only are included and properly marked up
(defn- get-col-names []
  (-> (data/run-mbql-query venues
        {:order-by [[:asc $id]]
         :limit    1})
      tu/round-fingerprint-cols
      :data
      :cols
      set))

(expect-with-non-timeseries-dbs
  (u/key-by :id (venues-cols))
  (u/key-by :id (get-col-names)))

(expect-with-non-timeseries-dbs
  (u/key-by :id (for [col (venues-cols)]
                  (if (= (data/id :venues :price) (u/get-id col))
                    (assoc col :visibility_type :details-only)
                    col)))
  (tu/with-temp-vals-in-db Field (data/id :venues :price) {:visibility_type :details-only}
    (u/key-by :id (get-col-names))))


;;; ----------------------------------------------- :sensitive fields ------------------------------------------------

;;; Make sure :sensitive information fields are never returned by the QP
(qp-expect-with-all-drivers
  {:columns     (->columns "id" "name" "last_login")
   :cols        [(users-col :id)
                 (users-col :name)
                 (users-col :last_login)]
   :rows        [[ 1 "Plato Yeshua"]
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
                 [15 "Rüstem Hebel"]]
   :native_form true}
  ;; Filter out the timestamps from the results since they're hard to test :/
  (-> (data/run-mbql-query users
        {:order-by [[:asc $id]]})
      booleanize-native-form
      tu/round-fingerprint-cols
      (update-in [:data :rows] (partial mapv (fn [[id name last-login]]
                                               [(int id) name])))))

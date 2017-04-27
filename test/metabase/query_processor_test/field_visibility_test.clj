(ns metabase.query-processor-test.field-visibility-test
  "Tests for behavior of fields with different visibility settings."
  (:require [metabase.models.field :refer [Field]]
            [metabase.query-processor-test :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.test.data :as data]
            [toucan.db :as db]))

;;; ------------------------------------------------------------ :details-only fields  ------------------------------------------------------------
;; make sure that rows where visibility_type = details-only are included and properly marked up
(defn- get-col-names []
  (-> (data/run-query venues
        (ql/order-by (ql/asc $id))
        (ql/limit 1))
      :data :cols set))

(expect-with-non-timeseries-dbs
  [(set (venues-cols))
   #{(venues-col :category_id)
     (venues-col :name)
     (venues-col :latitude)
     (venues-col :id)
     (venues-col :longitude)
     (assoc (venues-col :price) :visibility_type :details-only)}
   (set (venues-cols))]
  [(get-col-names)
   (do (db/update! Field (data/id :venues :price), :visibility_type :details-only)
       (get-col-names))
   (do (db/update! Field (data/id :venues :price), :visibility_type :normal)
       (get-col-names))])


;;; ------------------------------------------------------------ :sensitive fields ------------------------------------------------------------
;;; Make sure :sensitive information fields are never returned by the QP
(qp-expect-with-all-engines
  {:columns     (->columns "id" "name" "last_login")
   :cols        [(users-col :id)
                 (users-col :name)
                 (users-col :last_login)],
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
  (-> (data/run-query users
        (ql/order-by (ql/asc $id)))
      booleanize-native-form
      (update-in [:data :rows] (partial mapv (fn [[id name last-login]]
                                               [(int id) name])))))

(ns metabase.test.data.data
  "The `DatabaseDefinition` and data of the primary test dataset."
  (:require [metabase.test.data :refer :all]
            [metabase.test-data.data :as test-data])
  (:import metabase.test.data.DatabaseDefinition))

;; ## Test Database / Tables / Fields
;;
;; Data is structured as follows:
;; *  users - 15 rows
;;    *  id
;;    *  name
;;    *  last_login
;;    *  password (sensitive)
;; *  categories - 75 rows
;;    *  id
;;    *  name
;; *  venues - 100 rows
;;    *  id
;;    *  name
;;    *  latitude
;;    *  longitude
;;    *  price           number of $$$. 0 if unknown, otherwise between 1-4.
;;    *  category_id
;; *  checkins - 1000 rows
;;    *  id
;;    *  user_id
;;    *  venue_id
;;    *  date

(println "Loading metabase.test.data.data...")
(defonce ^:const ^DatabaseDefinition test-data
  (create-database-definition
   "Test Database"
   ["users" [{:field-name "name"
              :base-type  :CharField}
             {:field-name "timestamp"
              :base-type  :DateTimeField}
             {:field-name "password"
              :base-type  :CharField
              :field-type :sensitive}]
    test-data/users]
   ["categories" [{:field-name "name"
                   :base-type  :CharField}]
    test-data/categories]
   ["venues" [{:field-name   "name"
               :base-type    :CharField}
              {:field-name   "latitude"
               :base-type    :FloatField
               :special-type :latitude}
              {:field-name   "longitude"
               :base-type    :FloatField
               :special-type :longitude}
              {:field-name   "price"
               :base-type    :IntegerField
               :special-type :category}
              {:field-name   "category_id"
               :base-type    :IntegerField
               :fk           :categories}]
    test-data/venues]
   ["checkins" [{:field-name "user_id"
                 :base-type  :IntegerField
                 :fk         :users}
                {:field-name "venue_id"
                 :base-type  :IntegerField
                 :fk         :venues}
                {:field-name "date"
                 :base-type  :DateField}]
    test-data/checkins]))

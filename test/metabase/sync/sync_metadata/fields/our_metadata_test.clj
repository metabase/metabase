(ns metabase.sync.sync-metadata.fields.our-metadata-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields.our-metadata :as fields.our-metadata]
   [metabase.test :as mt]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [metabase.util.match :as match]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

;; `our-metadata` should match up with what we have in the DB
(deftest does-metadata-match-test
  (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
    (try
      (sync-metadata/sync-db-metadata! (:id db))
      (is (= #{{:name              "id"
                :database-type     "SERIAL"
                :base-type         :type/Integer
                :effective-type    :type/Integer
                :semantic-type     :type/PK
                :pk?               true
                :database-required false
                :database-is-auto-increment true
                :json-unfolding    false
                :preview-display   true
                :visibility-type   :normal}
               {:name              "buyer"
                :database-type     "OBJECT"
                :base-type         :type/Dictionary
                :effective-type    :type/Dictionary
                :pk?               false
                :database-required false
                :database-is-auto-increment false
                :json-unfolding    false
                :preview-display   true
                :visibility-type   :normal
                :nested-fields     #{{:name              "name"
                                      :database-type     "VARCHAR"
                                      :base-type         :type/Text
                                      :effective-type    :type/Text
                                      :pk?               false
                                      :database-required false
                                      :json-unfolding    false
                                      :database-is-auto-increment false
                                      :preview-display   true
                                      :visibility-type   :normal}
                                     {:name              "cc"
                                      :database-type     "VARCHAR"
                                      :base-type         :type/Text
                                      :effective-type    :type/Text
                                      :pk?               false
                                      :database-required false
                                      :json-unfolding    false
                                      :database-is-auto-increment false
                                      :preview-display   true
                                      :visibility-type   :normal}}}
               {:name              "ts"
                :database-type     "BIGINT"
                :base-type         :type/BigInteger
                :effective-type    :type/DateTime
                :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
                :pk?               false
                :database-is-auto-increment false
                :json-unfolding    false
                :database-required false
                :preview-display   true
                :visibility-type   :normal}
               {:name              "toucan"
                :database-type     "OBJECT"
                :base-type         :type/Dictionary
                :effective-type    :type/Dictionary
                :pk?               false
                :database-required false
                :database-is-auto-increment false
                :json-unfolding    false
                :preview-display   true
                :visibility-type   :normal
                :nested-fields     #{{:name              "name"
                                      :database-type     "VARCHAR"
                                      :base-type         :type/Text
                                      :effective-type    :type/Text
                                      :pk?               false
                                      :database-required false
                                      :json-unfolding    false
                                      :database-is-auto-increment false
                                      :preview-display   true
                                      :visibility-type   :normal}
                                     {:name              "details"
                                      :database-type     "OBJECT"
                                      :base-type         :type/Dictionary
                                      :effective-type    :type/Dictionary
                                      :pk?               false
                                      :database-required false
                                      :json-unfolding    false
                                      :database-is-auto-increment false
                                      :preview-display   true
                                      :visibility-type   :normal
                                      :nested-fields     #{{:name              "weight"
                                                            :database-type     "DECIMAL"
                                                            :base-type         :type/Decimal
                                                            :effective-type    :type/Decimal
                                                            :semantic-type     :type/Category
                                                            :pk?               false
                                                            :database-required false
                                                            :json-unfolding    false
                                                            :database-is-auto-increment false
                                                            :preview-display   true
                                                            :visibility-type   :normal}
                                                           {:name              "age"
                                                            :database-type     "INT"
                                                            :base-type         :type/Integer
                                                            :effective-type    :type/Integer
                                                            :pk?               false
                                                            :database-required false
                                                            :json-unfolding    false
                                                            :database-is-auto-increment false
                                                            :preview-display   true
                                                            :visibility-type   :normal}}}}}}
             (let [transactions-table-id   (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))
                   remove-ids-and-nil-vals #(match/replace-all %
                                              ;; database-position isn't stable since they are
                                              ;; defined in sets. changing keys will change the
                                              ;; order in the set implementation. (and position depends on database-position)
                                              #'map? (m/filter-vals some? (dissoc &match :id :database-position :position)))]
               (remove-ids-and-nil-vals (#'fields.our-metadata/our-metadata (t2/select-one :model/Table :id transactions-table-id))))))
      (finally
        (testing "removes the nested Fields it synced through delete-databases!, since on MySQL a plain delete cannot: their parent reference is ON DELETE RESTRICT"
          (database/delete-databases! [(:id db)]))))))

(deftest our-metadata-has-visibility-type-test
  (testing "both readers of the stored Fields return their visibility type, which sync compares with the warehouse's"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db)}
                   :model/Field    _     {:table_id (u/the-id table) :name "doc" :visibility_type :details-only}]
      (is (= [:details-only]
             (map :visibility-type (fields.our-metadata/our-metadata table))))
      (is (= [:details-only]
             (map :visibility-type (get (fields.our-metadata/our-metadata-by-table-id [(u/the-id table)])
                                        (u/the-id table))))))))

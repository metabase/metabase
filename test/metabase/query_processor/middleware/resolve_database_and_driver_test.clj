(ns metabase.query-processor.middleware.resolve-database-and-driver-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models :refer [Database]]
   [metabase.models.setting :as setting]
   [metabase.query-processor.middleware.resolve-database-and-driver
    :as qp.resolve-database-and-driver]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(setting/defsetting resolve-db-test-database-only-setting
  "test Setting"
  :visibility     :internal
  :type           :json
  :database-local :allowed)

(deftest bind-database-local-settings-test
  (testing "resolve-database-and-driver should bind *database-local-values*"
    (t2.with-temp/with-temp [Database database {:engine   :h2
                                                :settings {:resolve-db-test-database-only-setting
                                                           {:number-of-cans 2}}}]
      (mt/with-db database
        (qp.store/with-metadata-provider (mt/id)
          (let [qp (qp.resolve-database-and-driver/resolve-driver-and-database-local-values
                    (fn [_query _rff _context]
                      (is (= {:resolve-db-test-database-only-setting {:number-of-cans 2}}
                             setting/*database-local-values*))
                      (resolve-db-test-database-only-setting)))]
            (is (= {:number-of-cans 2}
                   (qp {:database (mt/id), :type :query, :query {}}
                       nil
                       nil)))))))))

(deftest bootstrap-metadata-provider-test
  (t2.with-temp/with-temp [:model/Card {card-1-id :id, :as card-1} {:database_id   (mt/id)
                                                                    :dataset_query (mt/mbql-query venues)}
                           :model/Card {card-2-id :id, :as card-2} {:dataset_query
                                                                    {:database lib.schema.id/saved-questions-virtual-database-id
                                                                     :type     :query
                                                                     :query    {:source-table (str "card__" card-1-id)}}}]
    (is (=? {:lib/type    :metadata/card
             :database-id (mt/id)}
            (lib.metadata.protocols/card (#'qp.resolve-database-and-driver/bootstrap-metadata-provider) card-1-id)))
    (is (=? {:lib/type    :metadata/card
             :database-id (mt/id)}
            (lib.metadata.protocols/card (#'qp.resolve-database-and-driver/bootstrap-metadata-provider) card-2-id)))
    (is (= (mt/id)
           (qp.resolve-database-and-driver/resolve-database-id (:dataset_query card-1))))
    (is (= (mt/id)
           (qp.resolve-database-and-driver/resolve-database-id (:dataset_query card-2))))))

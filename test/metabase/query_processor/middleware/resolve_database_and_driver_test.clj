(ns metabase.query-processor.middleware.resolve-database-and-driver-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Database]]
            [metabase.models.setting :as setting]
            [metabase.query-processor.middleware.resolve-database-and-driver :as resolve-db-and-driver]
            [metabase.test :as mt]))

(setting/defsetting resolve-db-test-database-only-setting
  "test Setting"
  :visibility     :internal
  :type           :json
  :database-local :allowed)

(deftest bind-database-local-settings-test
  (testing "resolve-database-and-driver should bind *database-local-values*"
    (mt/with-temp Database [database {:engine   :h2
                                      :settings {:resolve-db-test-database-only-setting
                                                 {:number-of-cans 2}}}]
      (mt/with-db database
        (mt/with-everything-store
          (let [qp (resolve-db-and-driver/resolve-database-and-driver
                    (fn [query _rff _context]
                      (is (= {:resolve-db-test-database-only-setting {:number-of-cans 2}}
                             setting/*database-local-values*))
                      (resolve-db-test-database-only-setting)))]
            (is (= {:number-of-cans 2}
                   (qp {:database (mt/id), :type :query, :query {}}
                       nil
                       nil)))))))))

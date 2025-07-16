(ns metabase-enterprise.semantic-search.query-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db]))

;; delay is used to satisfy kondo validate-deftest rule (guarantees multiple threads cannot race to init the db)
(def ^:private init-delay
  (delay
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))))

(defn- once-fixture [f]
  (when semantic.db/db-url
    @init-delay
    (f)))

(use-fixtures :once #'once-fixture)

(deftest database-initialised-test
  (is (some? @semantic.db/data-source))
  (is (= {:test 1} (semantic.db/test-connection!))))

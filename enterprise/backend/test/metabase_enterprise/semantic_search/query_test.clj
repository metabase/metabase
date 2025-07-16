(ns metabase-enterprise.semantic-search.query-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db]))

(defn- once-fixture! [f]
  (when semantic.db/db-url
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))
    (f)))

(use-fixtures :once #'once-fixture!)

(deftest database-initialised-test
  (is (some? @semantic.db/data-source))
  (is (= {:test 1} (semantic.db/test-connection!))))

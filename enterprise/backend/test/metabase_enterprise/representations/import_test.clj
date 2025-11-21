(ns metabase-enterprise.representations.import-test
  (:require
   [clojure.test :refer :all]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

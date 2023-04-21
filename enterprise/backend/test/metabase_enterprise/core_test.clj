(ns metabase-enterprise.core-test
  (:require [clojure.test :refer [deftest is]]
            [metabase-enterprise.core]
            [metabase.config :as config]
            [toucan2.core :as t2]))

(deftest no-op-in-oss-mode
  (if config/ee-available?
    (is (= nil (metabase-enterprise.core/ensure-audit-db-exists!)))
    (do
      (t2/delete! 'Database :is_audit true)
      (is (= :metabase-enterprise.core/installed (metabase-enterprise.core/ensure-audit-db-exists!)))
      (t2/delete! 'Database :is_audit true))))

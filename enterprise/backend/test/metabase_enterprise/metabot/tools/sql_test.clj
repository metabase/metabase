(ns metabase-enterprise.metabot.tools.sql-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest sandboxed-user-has-no-native-query-access-test
  (sandbox.tu/with-gtaps! {:gtaps {:checkins {}}}
    ;; The permissions API refuses SQL access to a sandboxed group now, but instances can still hold it from before.
    (perms/set-database-permission! &group (mt/id) :perms/create-queries :query-builder-and-native)
    (is (= :query-builder-and-native
           (perms/full-database-permission-for-user (mt/user->id :rasta) :perms/create-queries (mt/id))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have permissions to run this query"
                          (qp/process-query (lib/native-query (mt/metadata-provider) "SELECT 1"))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have permission to write SQL queries"
                          (sql.common/check-native-query-access! (mt/id))))))

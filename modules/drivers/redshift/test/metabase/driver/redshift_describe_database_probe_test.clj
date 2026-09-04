(ns ^:mb/driver-tests metabase.driver.redshift-describe-database-probe-test
  "Guards the one coupling that broke `describe-database-exclude-metabase-cache-test`.

  That test picks schemas with an inclusion filter and then asserts the sync found the session schema. The
  filter and the session-schema name are written in two places -- the filter in the test, the name in
  [[metabase.driver.sql.test-util.unique-prefix/unique-prefix]] -- and nothing connected them. When the prefix
  gained a `temp_` the filter's `20*` stopped matching, the sync returned nothing, and the failure surfaced as
  an empty result set rather than as a naming change.

  This runs without a cluster, so the drift is caught in any test run rather than only in the Redshift job."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sync :as driver.s]
   [metabase.test.data.redshift :as redshift.tx]))

(set! *warn-on-reflection* true)

(def ^:private inclusion-patterns
  "The filter [[metabase.driver.redshift-test/describe-database-exclude-metabase-cache-test]] syncs with."
  "metabase_cache*,temp_*,pg_*")

(deftest session-schema-matches-inclusion-filter-test
  (testing "the inclusion filter admits the session schema the test loads its dataset into"
    (is (boolean (driver.s/include-schema? inclusion-patterns nil (redshift.tx/unique-session-schema)))
        (str "inclusion filter " (pr-str inclusion-patterns) " does not match session schema "
             (pr-str (redshift.tx/unique-session-schema))
             " -- describe-database will return nothing and the sync test will fail with an empty set"))
    (is (not (boolean (driver.s/include-schema? inclusion-patterns nil "public")))
        "and still rejects an unrelated schema")))

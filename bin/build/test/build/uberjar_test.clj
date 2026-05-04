(ns build.uberjar-test
  (:require
   [build.uberjar]
   [clojure.test :refer [are deftest testing]]))

(set! *warn-on-reflection* true)

(deftest dependency-ignore-patterns-test
  (testing "carve-out for drivers excluded from AOT keeps their .clj source (#73560)"
    (let [patterns @#'build.uberjar/dependency-ignore-patterns]
      (are [path excluded] (= excluded (boolean (some #(re-matches % path) patterns)))
        "metabase/driver/oracle.clj"      false
        "metabase/driver/vertica.clj"     false
        "metabase/driver/oracle.cljc"     false
        "metabase/driver/oracle/util.clj" false ; future helper namespaces under the carved-out drivers
        "metabase/driver/h2.clj"          true
        "metabase/util.clj"               true
        "metabase/driver/oracleish.clj"   true
        "metabase/util/oracle.clj"        true))))

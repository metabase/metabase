(ns build.uberjar-test
  (:require
   [build.uberjar]
   [clojure.test :refer [deftest is testing]]))

(set! *warn-on-reflection* true)

(defn- excluded? [path]
  (let [patterns @#'build.uberjar/dependency-ignore-patterns]
    (boolean (some #(re-matches % path) patterns))))

(deftest dependency-ignore-patterns-test
  (testing "drivers excluded from AOT keep their .clj source in the uberjar (#73560)"
    (is (not (excluded? "metabase/driver/oracle.clj")))
    (is (not (excluded? "metabase/driver/vertica.clj")))
    (is (not (excluded? "metabase/driver/oracle.cljc")))
    (is (not (excluded? "metabase/driver/oracle/util.clj"))
        "future helper namespaces under the carved-out drivers must also be kept"))
  (testing "metabase clj source from AOT-compiled drivers and core is still excluded"
    (is (excluded? "metabase/driver/h2.clj"))
    (is (excluded? "metabase/util.clj"))
    (is (excluded? "metabase/driver/oracleish.clj"))
    (is (excluded? "metabase/util/oracle.clj"))))

(ns hooks.clojure.test-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.edn :as edn]
   [clojure.test :refer :all]
   [hooks.clojure.test]))

(set! *warn-on-reflection* true)

(defn- deftest-warnings
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/disallow-hardcoded-driver-names-in-tests {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.test/deftest {:node   (api/parse-string form)
                                 :config {:linters
                                          {:metabase/disallow-hardcoded-driver-names-in-tests
                                           {:drivers
                                            #{:athena}}}}})
    (mapv :message @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel disallow-hardcoded-driver-names-in-tests-test
  (is (= []
         (deftest-warnings
           "(mt/test-drivers (mt/normal-drivers)
              (do-something))")))
  (is (= ["Do not hardcode driver name :athena in driver tests! [:metabase/disallow-hardcoded-driver-names-in-tests]"]
         (deftest-warnings
           "(mt/test-drivers (mt/normal-drivers)
              (when-not (= driver/*driver* :athena)
                (do-something)))")))
  (testing "make sure :clj-kondo/ignore is propagated correctly"
    (is (= []
           (deftest-warnings
             "(mt/test-drivers (mt/normal-drivers)
                #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
                (when-not (= driver/*driver* :athena)
                  (do-something)))")))))

(deftest ^:parallel check-driver-keywords-test
  (testing "Make sure we keep hooks.clojure.test/driver-keywords up to date"
    (let [driver-keywords (-> (slurp ".clj-kondo/config.edn")
                              edn/read-string
                              (get-in [:linters :metabase/disallow-hardcoded-driver-names-in-tests :drivers]))
          driver-modules (->> (slurp "modules/drivers/deps.edn")
                              edn/read-string
                              :deps
                              vals
                              (keep (comp keyword :local/root))
                              (into #{}))]
      (doseq [driver driver-modules]
        (is (contains? driver-keywords driver)
            (format "hooks.clojure.test/driver-keywords should contain %s, please add it" driver))))))

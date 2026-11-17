(ns metabase.search.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.permissions :as search.permissions]))

(deftest ^:parallel sandboxed-impersonated-or-routed-user?-test
  (let [ctx {:is-impersonated-user? false :is-sandboxed-user? false :is-routed-user? false}]
    (testing "all three flags false: not restricted"
      (is (not (search.permissions/sandboxed-impersonated-or-routed-user? ctx))))
    (doseq [flag [:is-impersonated-user? :is-sandboxed-user? :is-routed-user?]]
      (testing (str flag " true: restricted")
        (is (search.permissions/sandboxed-impersonated-or-routed-user? (assoc ctx flag true))))
      (testing (str flag " unset or nil: restricted (fail closed)")
        (is (search.permissions/sandboxed-impersonated-or-routed-user? (dissoc ctx flag)))
        (is (search.permissions/sandboxed-impersonated-or-routed-user? (assoc ctx flag nil)))))))

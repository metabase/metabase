(ns hooks.metabase.toucan.table-name-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.table-name :as toucan.table-name]))

;; `hooks.methodical.macros` isn't on the classpath under `.clj-kondo/test`,
;; so stub it out — `lint-defmethod` delegates to it via `requiring-resolve`.
;; If it ever becomes available, warn so we remember to delete this stub.
(if (find-ns 'hooks.methodical.macros)
  (println (str "WARNING: hooks.methodical.macros is now on the test classpath; "
                "the stub in " *ns* " is no longer needed and can be removed."))
  (do (create-ns 'hooks.methodical.macros)
      (intern 'hooks.methodical.macros 'defmethod (fn [input] input))))

(defn- lint-defmethod [form filename]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/toucan-model-ns {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (toucan.table-name/lint-defmethod {:node     (hooks/parse-string (pr-str form))
                                       :filename filename})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel table-name-must-live-in-models-namespace-test
  (testing "defmethod t2/table-name outside a models namespace is flagged"
    (is (=? [{:type :metabase/toucan-model-ns}]
            (lint-defmethod '(defmethod t2/table-name :model/Foo [_] :foo)
                            "/repo/src/metabase/foo/core.clj"))))
  (testing "defmethod t2/table-name inside <module>/models.clj is allowed"
    (is (empty? (lint-defmethod '(defmethod t2/table-name :model/Foo [_] :foo)
                                "/repo/src/metabase/foo/models.clj"))))
  (testing "defmethod t2/table-name inside <module>/models/<model>.clj is allowed"
    (is (empty? (lint-defmethod '(defmethod t2/table-name :model/Foo [_] :foo)
                                "/repo/src/metabase/foo/models/bar.clj"))))
  (testing "enterprise modules are also allowed"
    (is (empty? (lint-defmethod '(defmethod t2/table-name :model/Foo [_] :foo)
                                "/repo/enterprise/backend/src/metabase_enterprise/foo/models.clj"))))
  (testing "toucan2.core/table-name is also recognized"
    (is (=? [{:type :metabase/toucan-model-ns}]
            (lint-defmethod '(defmethod toucan2.core/table-name :model/Foo [_] :foo)
                            "/repo/src/metabase/foo/core.clj"))))
  (testing "unrelated defmethods are ignored"
    (is (empty? (lint-defmethod '(defmethod t2/primary-keys :model/Foo [_] [:id])
                                "/repo/src/metabase/foo/core.clj")))))

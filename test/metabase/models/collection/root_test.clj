(ns metabase.models.collection.root-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]))

(deftest perms-test
  (doseq [[perms expected] {nil                    false
                            #{"/"}                 true
                            #{"/db/1/"}            false
                            #{"/collection/root/"} true}
          f                [#'mi/can-read? #'mi/can-write?]]
    (testing (format "%s with perms %s" f (pr-str perms))
      (binding [api/*current-user-permissions-set* (atom perms)]
        (is (= expected
               (f collection.root/root-collection)))))))

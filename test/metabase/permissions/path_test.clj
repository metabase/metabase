(ns metabase.permissions.path-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.path :as permissions.path]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

(deftest ^:parallel collection-path-test
  (doseq [[perms-type f] {:read      #'permissions.path/collection-read-path
                          :readwrite #'permissions.path/collection-readwrite-path}]
    (doseq [[input expected]
            {1                                                        {:read      "/collection/1/read/"
                                                                       :readwrite "/collection/1/"}
             {:id 1}                                                  {:read      "/collection/1/read/"
                                                                       :readwrite "/collection/1/"}
             collection/root-collection                               {:read      "/collection/root/read/"
                                                                       :readwrite "/collection/root/"}
             (assoc collection/root-collection :namespace "snippets") {:read      "/collection/namespace/snippets/root/read/"
                                                                       :readwrite "/collection/namespace/snippets/root/"}
             (assoc collection/root-collection :namespace "a/b")      {:read      "/collection/namespace/a\\/b/root/read/"
                                                                       :readwrite "/collection/namespace/a\\/b/root/"}
             (assoc collection/root-collection :namespace :a/b)       {:read      "/collection/namespace/a\\/b/root/read/"
                                                                       :readwrite "/collection/namespace/a\\/b/root/"}}
            :let [expected (get expected perms-type)]]
      (testing (pr-str (list f input))
        (is (= expected
               (f input)))))
    (doseq [input [{} nil "1"]]
      (testing (pr-str (list f input))
        (is (thrown?
             Exception
             (f input)))))))

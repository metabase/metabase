(ns hooks.metabase.collections.permission-check-test
  (:require
   [clj-kondo.core :as kondo]
   [clojure.string :as str]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(defn- lint!
  [ns-sym filename body-lines]
  (let [src (str/join "\n" (concat [(str "(ns " ns-sym)
                                    "  (:require [metabase.api.common :as api]"
                                    "            [metabase.collections.core :as collections]"
                                    "            [metabase.collections.models.collection :as collection]"
                                    "            [metabase.collections.models.collection.root :as collection.root]"
                                    "            [metabase.models.interface :as mi]))"]
                                   body-lines))]
    (->> (with-in-str src
           (kondo/run! {:lint       ["-"]
                        :filename   filename
                        :config-dir ".clj-kondo"
                        :cache      false}))
         :findings
         (filterv #(= :metabase/collection-permission-check (:type %))))))

(defn- findings-in
  [ns-sym & body-lines]
  (lint! ns-sym "src/metabase/example.clj" body-lines))

(defn- findings
  "Like [[findings-in]], in a namespace of a module that owns no collection checks."
  [& body-lines]
  (apply findings-in 'metabase.queries.example body-lines))

(deftest ^:parallel by-id-check-test
  (testing "a check of :model/Collection by id is flagged, for read and write"
    (doseq [check ["api/read-check" "api/write-check" "mi/can-read?" "mi/can-write?"]]
      (testing check
        (is (=? [{:level   :error
                  :message (re-pattern (str ".*`" (java.util.regex.Pattern/quote check) "`.*"))}]
                (findings (format "(%s :model/Collection 1)" check)))))))
  (testing "the message names the four guard functions"
    (is (=? [{:message #"(?s).*can-read-governing-collection\?.*can-write-governing-collection\?.*check-read-governing-collection.*check-write-governing-collection.*"}]
            (findings "(api/write-check :model/Collection 1)"))))
  (testing "a check of another model by id is not flagged"
    (is (empty? (findings "(api/read-check :model/Card 1)"
                          "(mi/can-write? :model/Dashboard 1)"))))
  (testing "a check of an instance is not flagged"
    (is (empty? (findings "(defn f [coll] (api/read-check coll) (mi/can-write? coll))"))))
  (testing "the collections and collections REST modules are allowed"
    (is (empty? (findings-in 'metabase.collections.example
                             "(api/write-check :model/Collection 1)"
                             "(mi/can-read? :model/Collection 1)")))
    (is (empty? (findings-in 'metabase.collections-rest.example
                             "(api/read-check :model/Collection 1)"
                             "(mi/can-write? :model/Collection 1)")))))

(deftest ^:parallel root-placeholder-check-test
  (testing "a check of the root collection placeholder is flagged, for read and write"
    (doseq [check ["api/read-check" "api/write-check" "mi/can-read?" "mi/can-write?"]]
      (testing check
        (is (=? [{:level :error}]
                (findings (format "(%s collection.root/root-collection)" check)))))))
  (testing "a re-export of the placeholder is flagged"
    (is (=? [{:level :error}]
            (findings "(mi/can-read? collection/root-collection)"))))
  (testing "a referred placeholder is flagged"
    (is (=? [{:level :error}]
            (findings "(require '[metabase.collections.models.collection.root :refer [root-collection]])"
                      "(api/write-check root-collection)"))))
  (testing "a local named like the placeholder is not flagged"
    (is (empty? (findings "(defn f [root-collection] (mi/can-read? root-collection))"
                          "(defn g [x] (let [root-collection x] (api/write-check root-collection)))"))))
  (testing "a local that shadows a referred placeholder is not flagged"
    (is (empty? (findings "(require '[metabase.collections.models.collection.root :refer [root-collection]])"
                          "(defn f [root-collection] (mi/can-write? root-collection))"))))
  (testing "only the collections module is allowed"
    (is (empty? (findings-in 'metabase.collections.example
                             "(mi/can-read? collection.root/root-collection)"
                             "(api/write-check collection.root/root-collection)")))
    (is (=? [{:level :error}]
            (findings-in 'metabase.collections-rest.example
                         "(mi/can-read? collection.root/root-collection)")))))

(deftest ^:parallel root-placeholder-built-in-place-test
  (testing "a placeholder built by assoc is flagged, for read and write"
    (is (=? [{:level :error} {:level :error}]
            (findings "(mi/can-read? (assoc collection.root/root-collection :namespace :snippets))"
                      "(api/write-check (assoc collection/root-collection :namespace :snippets))"))))
  (testing "a placeholder built by either decorating function is flagged, for read and write"
    (is (=? [{:level :error} {:level :error} {:level :error}]
            (findings "(api/read-check (collection.root/root-collection-with-ui-details nil))"
                      "(mi/can-write? (collection/root-collection-with-ui-details :snippets))"
                      "(mi/can-read? (collection.root/hydrated-root-collection))"))))
  (testing "assoc on a local named like the placeholder is not flagged"
    (is (empty? (findings "(defn f [root-collection] (mi/can-read? (assoc root-collection :namespace nil)))"))))
  (testing "assoc on something else is not flagged"
    (is (empty? (findings "(defn f [coll] (mi/can-read? (assoc coll :namespace nil)))"))))
  (testing "only the collections module is allowed"
    (is (empty? (findings-in 'metabase.collections.example
                             "(mi/can-read? (assoc collection.root/root-collection :namespace :snippets))"
                             "(api/read-check (collection.root/root-collection-with-ui-details nil))"
                             "(mi/can-write? (collection.root/hydrated-root-collection))")))
    (is (=? [{:level :error} {:level :error} {:level :error}]
            (findings-in 'metabase.collections-rest.example
                         "(mi/can-read? (assoc collection.root/root-collection :namespace :snippets))"
                         "(api/read-check (collection.root/root-collection-with-ui-details nil))"
                         "(mi/can-write? (collection.root/hydrated-root-collection))")))))

(deftest ^:parallel test-files-are-exempt-test
  (is (empty? (lint! 'metabase.queries.example-test "test/metabase/queries/example_test.clj"
                     ["(mi/can-read? collection.root/root-collection)"
                      "(api/read-check :model/Collection 1)"]))))

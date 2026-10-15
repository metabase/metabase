(ns metabase-enterprise.library-branching.instance.system-items-test
  "The release content of the system items is what an instance reads after a person creates the Library."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.instance.kinds.collection :as instance.collection]
   [metabase.collections.core :as collections]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private library-id "librarylibrarylibrary")

(def ^:private section-ids ["librarylibrarydatadat" "librarylibrarymetrics" "librarylibrarydashbrd"])

(deftest release-content-is-what-the-instance-reads-test
  (t2/with-transaction [_ nil {:rollback-only true}]
    ;; Another test can leave a Library behind; the transaction rolls back its removal too.
    (t2/delete! :model/Collection :entity_id [:in (conj section-ids library-id)])
    (t2/update! :model/Collection :type [:in ["library" "library-data" "library-metrics" "library-dashboards"]]
                {:type nil})
    (collections/create-library-collection!)
    (let [read (instance.collection/read-collections (conj section-ids library-id))]
      (testing "the sections of a new Library are the system items"
        (is (= claims/system-items (dissoc read library-id))))
      (testing "the Library itself has this content; decode never adds it"
        (is (= {:kind :collection :name "Library" :place nil :refs #{} :attrs {:type "library"}}
               (get read library-id)))))))

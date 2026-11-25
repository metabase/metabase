(ns metabase.collections-rest.read-statements-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.models.document :as document]
   [metabase.documents.test-util :as doc.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn- statements
  "The number of app DB statements `thunk` runs."
  [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- personal-collections! [n]
  (let [user-ids (t2/insert-returning-pks! :model/User
                                           (mapv (fn [i]
                                                   (merge (t2.with-temp/with-temp-defaults :model/User)
                                                          {:first_name "Test"
                                                           :last_name  (str "User " i)
                                                           :email      (str "user-" i "-" (random-uuid) "@example.com")}))
                                                 (range n)))]
    (run! collection/user->personal-collection user-ids)))

(deftest tree-statements-do-not-grow-with-personal-collections-test
  (search.tu/with-index-disabled
    (mt/with-model-cleanup [:model/Collection :model/User]
      (personal-collections! 1)
      (mt/user-http-request :crowberto :get 200 "collection/tree")
      (let [count-at (fn [n]
                       (personal-collections! n)
                       (statements #(mt/user-http-request :crowberto :get 200 "collection/tree")))
            small    (count-at 5)
            large    (count-at 15)]
        (is (= small large))))))

(defn- documents! [coll-id n]
  (document/create-documents!
   (mapv (fn [i]
           {:name         (str "document " i)
            :creator_id   (mt/user->id :crowberto)
            :collection_id coll-id
            :document     (doc.tu/text->prose-mirror-ast (str "hello " i))
            :content_type "application/json+vnd.prose-mirror"})
         (range n))))

(deftest collection-items-statements-do-not-grow-with-documents-test
  (search.tu/with-index-disabled
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
      (mt/with-model-cleanup [:model/Document]
        (documents! coll-id 1)
        (doseq [user [:crowberto :rasta]]
          (let [request  #(mt/user-http-request user :get 200 (str "collection/" coll-id "/items"))
                _        (request)
                _        (documents! coll-id 5)
                small    (statements request)
                _        (documents! coll-id 10)
                large    (statements request)]
            (is (= small large) (str "as " user))))))))

(deftest document-can-read-answers-each-row-test
  (mt/with-temp [:model/Collection {readable-id :id}   {}
                 :model/Collection {unreadable-id :id} {}]
    (perms/grant-collection-read-permissions! (perms/all-users-group) readable-id)
    (mt/with-model-cleanup [:model/Document]
      (let [readable   (documents! readable-id 3)
            unreadable (documents! unreadable-id 2)
            documents  (t2/select :model/Document :id [:in (map :id (concat readable unreadable))] {:order-by [:id]})]
        (mt/with-test-user :rasta
          (is (= (concat (repeat 3 true) (repeat 2 false))
                 (map mi/can-read? (t2/hydrate documents :can_read)))))))))

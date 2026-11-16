(ns metabase.collections.governing-collection-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- status-code
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(deftest collection-test
  (mt/with-temp [:model/Collection {readable :id} {}
                 :model/Collection {writable :id} {}
                 :model/Collection {neither :id}  {}]
    ;; a new collection starts out writable by All Users
    (perms/revoke-collection-permissions! (perms/all-users-group) readable)
    (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
    (perms/revoke-collection-permissions! (perms/all-users-group) neither)
    (mt/with-test-user :rasta
      (doseq [[id can-read? can-write?] [[readable true  false]
                                         [writable true  true]
                                         [neither  false false]]]
        (testing (condp = id readable "readable" writable "writable" neither "neither")
          (is (= can-read? (collections/can-read-governing-collection? nil id)))
          (is (= can-write? (collections/can-write-governing-collection? nil id)))
          (is (= (when-not can-read? 403)
                 (status-code #(collections/check-read-governing-collection nil id))))
          (is (= (when-not can-write? 403)
                 (status-code #(collections/check-write-governing-collection nil id))))))
      (testing "the checks return the collection"
        (is (= writable (:id (collections/check-read-governing-collection nil writable))))
        (is (= writable (:id (collections/check-write-governing-collection nil writable)))))
      (testing "the namespace is not compared with the collection's"
        (is (true? (collections/can-write-governing-collection? :snippets writable)))
        (is (= writable (:id (collections/check-write-governing-collection :snippets writable))))))))

(deftest missing-collection-test
  (let [missing (inc (or (t2/select-one-pk :model/Collection {:order-by [[:id :desc]]}) 0))]
    (mt/with-test-user :crowberto
      (is (= 404 (status-code #(collections/check-read-governing-collection nil missing))))
      (is (= 404 (status-code #(collections/check-write-governing-collection nil missing)))))))

(deftest default-root-test
  (testing "with permission"
    (mt/with-test-user :rasta
      (is (true? (collections/can-read-governing-collection? nil nil)))
      (is (true? (collections/can-write-governing-collection? nil nil)))
      (is (collection.root/is-root-collection? (collections/check-read-governing-collection nil nil)))
      (is (collection.root/is-root-collection? (collections/check-write-governing-collection nil nil)))))
  (testing "without permission"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-test-user :rasta
        (is (false? (collections/can-read-governing-collection? nil nil)))
        (is (false? (collections/can-write-governing-collection? nil nil)))
        (is (= 403 (status-code #(collections/check-read-governing-collection nil nil))))
        (is (= 403 (status-code #(collections/check-write-governing-collection nil nil)))))
      (testing "read only"
        (perms/grant-collection-read-permissions! (perms/all-users-group) collection.root/root-collection)
        (mt/with-test-user :rasta
          (is (true? (collections/can-read-governing-collection? nil nil)))
          (is (false? (collections/can-write-governing-collection? nil nil))))))))

(deftest non-default-root-test
  (testing "nil means the root collection of the given namespace, not the default one"
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms :transforms
      (mt/with-test-user :rasta
        (is (true? (collections/can-write-governing-collection? nil nil)))
        (is (false? (collections/can-read-governing-collection? :transforms nil)))
        (is (false? (collections/can-write-governing-collection? :transforms nil)))
        (is (= 403 (status-code #(collections/check-read-governing-collection :transforms nil))))
        (is (= 403 (status-code #(collections/check-write-governing-collection :transforms nil)))))
      (perms/grant-collection-readwrite-permissions!
       (perms/all-users-group) (assoc collection.root/root-collection :namespace :transforms))
      (mt/with-test-user :rasta
        (is (true? (collections/can-read-governing-collection? :transforms nil)))
        (is (true? (collections/can-write-governing-collection? :transforms nil)))
        (is (= :transforms (:namespace (collections/check-read-governing-collection :transforms nil))))
        (is (= :transforms (:namespace (collections/check-write-governing-collection :transforms nil))))))))

(deftest ^:parallel root-namespace-test
  (testing "a declared model"
    (is (nil? (collections/root-namespace :model/Card))))
  (testing "an undeclared model throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #":model/User does not declare .* Add a .*root-namespace method"
                          (collections/root-namespace :model/User)))))

(deftest root-namespace-coverage-test
  (doseq [[_model nspace] models.resolution/model->namespace
          :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
    (classloader/require nspace))
  (let [models (descendants :perms/use-parent-collection-perms)]
    (is (seq models))
    (doseq [model models]
      (testing model
        (is (some? (get-method collections/root-namespace model)))))))

(ns metabase.mcp.v2.tools.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.tools.search :as tools.search]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private add-collection-paths
  #'tools.search/add-collection-paths)

(defn- path-for
  "`:collection_path` that `user` sees for a row contained in `collection-id`."
  [user collection-id]
  (mt/with-current-user (mt/user->id user)
    (:collection_path (first (add-collection-paths [{:collection {:id collection-id}}])))))

(deftest collection-path-omits-unreadable-ancestors-test
  (testing "GHY-4137: collection_path must not name ancestors the caller can't read — the path is a
            breadcrumb and follows effective-ancestors semantics, where an unreadable middle
            collection is dropped rather than hiding the whole path"
    (mt/with-temp [:model/Collection a {:name "Alpha"}
                   :model/Collection b {:name "Bravo"   :location (format "/%d/" (:id a))}
                   :model/Collection c {:name "Charlie" :location (format "/%d/%d/" (:id a) (:id b))}]
      (let [all-users (perms/all-users-group)]
        (perms/grant-collection-read-permissions! all-users a)
        (perms/revoke-collection-permissions! all-users b)
        (perms/grant-collection-read-permissions! all-users c)
        (testing "an admin, who can read every ancestor, sees the full path"
          (is (= "Alpha/Bravo/Charlie" (path-for :crowberto (:id c)))))
        (testing "a user who cannot read Bravo never sees its name"
          (is (= "Alpha/Charlie" (path-for :rasta (:id c)))))))))

(deftest collection-row-path-omits-unreadable-ancestors-test
  (testing "GHY-4137: a collection row builds its path from its own :location — that path must
            also omit unreadable ancestors"
    (mt/with-temp [:model/Collection a {:name "Alpha"}
                   :model/Collection b {:name "Bravo"   :location (format "/%d/" (:id a))}
                   :model/Collection c {:name "Charlie" :location (format "/%d/%d/" (:id a) (:id b))}]
      (let [all-users (perms/all-users-group)
            path-of   (fn [user coll]
                        (mt/with-current-user (mt/user->id user)
                          (:collection_path (first (add-collection-paths [(select-keys coll [:id :location])])))))]
        (perms/grant-collection-read-permissions! all-users a)
        (perms/revoke-collection-permissions! all-users b)
        (perms/grant-collection-read-permissions! all-users c)
        (is (= "Alpha/Bravo" (path-of :crowberto c)))
        (is (= "Alpha" (path-of :rasta c)))))))

(deftest collection-path-for-readable-ancestors-test
  (testing "a fully readable chain is unaffected by the permission filter"
    (mt/with-temp [:model/Collection a {:name "Alpha"}
                   :model/Collection b {:name "Bravo" :location (format "/%d/" (:id a))}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) a)
      (perms/grant-collection-read-permissions! (perms/all-users-group) b)
      (is (= "Alpha/Bravo" (path-for :rasta (:id b)))))))

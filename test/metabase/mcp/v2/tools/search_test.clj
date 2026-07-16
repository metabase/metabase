(ns metabase.mcp.v2.tools.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.tools.search :as tools.search]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private add-collection-paths
  #'tools.search/add-collection-paths)

(def ^:private validate-filters!
  #'tools.search/validate-filters!)

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

;; not ^:parallel: the kondo deftest lint treats the `!` suffix of `validate-filters!` as
;; destructive, though it only validates and throws
(deftest snippet-type-is-exclusive-test
  (testing "GHY-4137: snippets are served by a separate listing and paged separately, so mixing
            them with engine-backed types silently dropped snippets on a full page and repeated
            them on an underfilled one. The combination is a teaching error instead."
    (testing "snippet alone is fine"
      (is (some? (validate-filters! {:type ["snippet"]}))))
    (testing "engine types alone are fine"
      (is (some? (validate-filters! {:type ["question" "dashboard"]}))))
    (testing "no type at all is fine"
      (is (some? (validate-filters! {}))))
    (testing "snippet alongside another type names the offending types and how to split the call"
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                    #"cannot be combined with other types"
                                    (validate-filters! {:type ["question" "snippet"]})))]
        (is (re-find #"question" (ex-message e))
            "the error should name what to move to the other call"))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"cannot be combined with other types"
                            (validate-filters! {:type ["snippet" "dashboard" "table"]}))))
    (testing "the teaching error is a 400, not a server error"
      (is (= 400 (:status-code (ex-data (try (validate-filters! {:type ["question" "snippet"]})
                                             (catch clojure.lang.ExceptionInfo e e)))))))))

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

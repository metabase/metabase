(ns metabase.mcp.v2.tools.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.tools.search :as tools.search]
   [metabase.metabot.tools.search :as metabot.search]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private add-collection-paths
  #'tools.search/add-collection-paths)

(def ^:private validate-filters!
  #'tools.search/validate-filters!)

(def ^:private resolve-collection-filter
  #'tools.search/resolve-collection-filter)

(def ^:private engine-results
  #'tools.search/engine-results)

(defn- path-for
  "`:collection_path` that `user` sees for a row contained in `collection-id`."
  [user collection-id]
  (mt/with-current-user (mt/user->id user)
    (:collection_path (first (add-collection-paths [{:collection {:id collection-id}}])))))

(deftest ^:parallel rv-model-type-maps-invert-losslessly-test
  (testing "GHY-4137: rv-model->type is the inverse of type->rv-model — the inversion must not
            collapse two types onto one recent-views model, so the two maps have equal counts"
    (is (= (count @#'tools.search/type->rv-model)
           (count @#'tools.search/rv-model->type)))))

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

;; not ^:parallel: the kondo deftest lint treats the `!` suffix of `validate-filters!` as
;; destructive, though it only validates and throws
(deftest collection-id-root-is-inert-test
  (testing "GHY-4137: collection_id \"root\" is documented as \"no scoping\" and resolves to nil, so
            it must not trip the collection teaching errors the way a real collection id does"
    (testing "\"root\" passes every check a real collection id would fail"
      (is (some? (validate-filters! {:type ["database"] :collection_id "root"}))
          "collectionless type + root: no error")
      (is (some? (validate-filters! {:type ["table"] :collection_id "root"}))
          "table + root (no Library feature): no error")
      (is (some? (validate-filters! {:type ["snippet"] :collection_id "root"}))
          "snippet + root: no error")
      (is (some? (validate-filters! {:recent true :collection_id "root"}))
          "recents + root: no error"))
    (testing "a real collection id still errors where it genuinely can't apply"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"don't live in collections"
                            (validate-filters! {:type ["database"] :collection_id "someEntityId01234567_"})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot filter snippets"
                            (validate-filters! {:type ["snippet"] :collection_id "someEntityId01234567_"})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"recent: true supports only the type filter"
                            (validate-filters! {:recent true :collection_id "someEntityId01234567_"}))))))

;; not ^:parallel: with-premium-features rebinds a global, and the `!` in validate-filters! trips
;; the kondo deftest lint
(deftest table-collection-id-requires-library-feature-test
  (testing "GHY-4137: filtering tables by a real collection_id requires the Library feature; on an
            instance without it the combination is a teaching error, but \"root\" stays inert"
    (mt/with-premium-features #{}
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"requires the Library feature"
                            (validate-filters! {:type ["table"] :collection_id "someEntityId01234567_"}))
          "no Library feature + real collection id: error")
      (is (some? (validate-filters! {:type ["table"] :collection_id "root"}))
          "\"root\" is inert even without the Library feature"))
    (mt/with-premium-features #{:library}
      (is (some? (validate-filters! {:type ["table"] :collection_id "someEntityId01234567_"}))
          "with the Library feature, table + collection id is allowed"))))

;; not ^:parallel: the `!` in validate-filters! trips the kondo deftest lint
(deftest collection-scoping-accepts-numeric-id-test
  (testing "GHY-4137: collection_id may be a numeric id, not only a string entity_id — a numeric id
            counts as scoping"
    (testing "validate-filters! trips the collectionless error for a numeric id on a collectionless type"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"don't live in collections"
                            (validate-filters! {:type ["database"] :collection_id 5}))))
    (testing "resolve-collection-filter resolves a real numeric collection id behind the read check"
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= coll-id (resolve-collection-filter coll-id))))))))

(defn- nothing-to-search?
  "True when the search handler rejects `args` with the \"Nothing to search for\" teaching error.
   A non-matching failure (e.g. the engine's \"No current user\") means validation was passed."
  [args]
  (try
    (tools.search/search-tool args {:token-scopes #{"agent:search"}})
    false
    (catch clojure.lang.ExceptionInfo e
      (boolean (re-find #"Nothing to search for" (ex-message e))))))

(deftest ^:parallel collection-id-root-alone-is-empty-request-test
  (testing "GHY-4137: \"root\" is inert everywhere — as the *only* argument it scopes nothing, so
            the request has no query and no real filter and is rejected as empty rather than
            listing the entire instance"
    (is (nothing-to-search? {:collection_id "root"}))
    (is (nothing-to-search? {}) "sanity: a truly empty request is also rejected"))
  (testing "\"root\" combined with a real query or filter is a valid search — it passes validation"
    (is (not (nothing-to-search? {:collection_id "root" :type ["dashboard"]})))
    (is (not (nothing-to-search? {:collection_id "root" :term_queries ["sales"]})))))

(deftest engine-results-reports-total-test
  (testing "GHY-4137: engine-results reports the engine's total for every search, including a
            superuser transform search — transforms are no longer dropped by a post-filter, so
            the total is accurate and is not suppressed"
    (with-redefs [metabot.search/search (fn [_ctx] (with-meta [{:id 1 :type "question"}] {:total 30}))]
      (mt/with-test-user :crowberto
        (is (= 30 (:total (engine-results {} ["question" "transform"] nil 20 0))))
        (is (= 30 (:total (engine-results {} ["question" "dashboard"] nil 20 0))))))))

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

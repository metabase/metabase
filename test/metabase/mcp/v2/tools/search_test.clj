(ns metabase.mcp.v2.tools.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.activity-feed.models.recent-views :as recent-views]
   [metabase.mcp.v2.tools.search :as tools.search]
   [metabase.metabot.tools.search :as metabot.search]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private add-collection-paths
  #'tools.search/add-collection-paths)

(def ^:private validate-filters!
  #'tools.search/validate-filters!)

(def ^:private validate-modes!
  #'tools.search/validate-modes!)

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
(deftest semantic-queries-against-snippets-is-teaching-error-test
  (testing "GHY-4137: snippets aren't in the search index — snippet-rows substring-matches names
            against term_queries and semantic_queries alike, so a natural-language semantic_queries
            entry essentially never hits a name and silently returns an empty page the agent reads
            as \"no such snippets\". A teaching error instead of a guaranteed-empty search."
    (testing "semantic_queries with type: [\"snippet\"] is rejected"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"semantic_queries cannot search snippets"
                            (validate-filters! {:type ["snippet"] :semantic_queries ["customer lifetime value"]}))))
    (testing "term_queries with type: [\"snippet\"] is unaffected — substring matching works for keywords"
      (is (some? (validate-filters! {:type ["snippet"] :term_queries ["cltv"]}))))
    (testing "snippet alone, with no queries at all, is unaffected"
      (is (some? (validate-filters! {:type ["snippet"]}))))
    (testing "semantic_queries without type: [\"snippet\"] is unaffected — it reaches the engine, which supports it"
      (is (some? (validate-filters! {:semantic_queries ["customer lifetime value"]}))))
    (testing "the teaching error is a 400"
      (is (= 400 (:status-code (ex-data (try (validate-filters! {:type ["snippet"] :semantic_queries ["x"]})
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

;; not ^:parallel: the `!` in validate-filters! trips the kondo deftest lint
(deftest transform-collection-id-is-teaching-error-test
  (testing "GHY-4137: the search index doesn't record a transform's collection, so type:[transform]
            with a collection_id can only ever return an empty page — a teaching error instead of a
            silent empty result the agent would read as \"no transforms here\""
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"collection_id cannot filter transforms"
                          (validate-filters! {:type ["transform"] :collection_id "someEntityId01234567_"})))
    (testing "transform without a collection_id is fine"
      (is (some? (validate-filters! {:type ["transform"]}))))
    (testing "\"root\" collection_id stays inert for transforms"
      (is (some? (validate-filters! {:type ["transform"] :collection_id "root"}))))))

;; not ^:parallel: the `!` in validate-filters! trips the kondo deftest lint
(deftest archived-non-archivable-type-is-teaching-error-test
  (testing "GHY-4137: table, database, and transform have no archived state, so archived: true with
            any of them guarantees an empty page — the engine silently drops the type. Teach instead."
    (doseq [t ["table" "database" "transform"]]
      (testing t
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no archived state"
                              (validate-filters! {:type [t] :archived true})))))
    (testing "archivable types are unaffected"
      (is (some? (validate-filters! {:type ["question" "dashboard"] :archived true}))))
    (testing "archived: false is fine even for the non-archivable types"
      (is (some? (validate-filters! {:type ["table"] :archived false}))))
    (testing "no archived filter at all is fine"
      (is (some? (validate-filters! {:type ["table"]}))))))

;; not ^:parallel: with-premium-features rebinds a global, and the `!` in validate-filters! trips
;; the kondo deftest lint
(deftest omitted-type-narrows-and-discloses-filter-incompatibility-test
  (testing "GHY-4137/I5: created_by/collection_id/archived are only checked against types the caller
            named explicitly — when type is omitted, the search runs against every engine type, and
            the engine silently drops whichever ones don't support the filter with no error and no
            signal. Naming a type explicitly that doesn't support the filter is still a teaching
            error; an omitted type narrows to the supporting types instead and discloses it, so the
            natural unscoped call (e.g. created_by: \"me\" with no type) still returns results."
    (testing "created_by with no type: narrows to creator-indexing types and discloses it, does not throw"
      (let [{:keys [types disclosures]} (validate-filters! {:created_by "me"})]
        (is (= ["action" "dashboard" "document" "measure" "metric" "model" "question"] types))
        (is (= 1 (count disclosures)))
        (is (re-find #"created_by narrowed the search to" (first disclosures)))
        (is (re-find #"collection, database, segment, table, transform don't index a creator" (first disclosures)))))
    (testing "collection_id with no type: narrows to collection-dwelling types and discloses it, does not throw"
      (let [{:keys [types disclosures]} (validate-filters! {:collection_id "someEntityId01234567_"})]
        (is (not (contains? (set types) "database")))
        (is (not (contains? (set types) "measure")))
        (is (not (contains? (set types) "segment")))
        (is (= 1 (count disclosures)))
        (is (re-find #"collection_id narrowed the search to" (first disclosures)))))
    (testing "archived: true with no type: narrows to archivable types and discloses it, does not throw"
      (let [{:keys [types disclosures]} (validate-filters! {:archived true})]
        (is (not (contains? (set types) "table")))
        (is (not (contains? (set types) "database")))
        (is (not (contains? (set types) "transform")))
        (is (= 1 (count disclosures)))
        (is (re-find #"archived: true narrowed the search to" (first disclosures)))))
    (testing "created_by with a type set that is entirely creator-supporting is unaffected — no narrowing"
      (is (= {:types nil :disclosures []}
             (validate-filters! {:created_by "me" :type ["question" "dashboard"]}))))
    (testing "naming an incompatible type explicitly is still a teaching error, not a silent narrow"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"created_by only applies to types that index a creator"
                            (validate-filters! {:created_by "me" :type ["database"]})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"don't live in collections"
                            (validate-filters! {:collection_id "someEntityId01234567_" :type ["database"]})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no archived state"
                            (validate-filters! {:archived true :type ["table"]}))))
    (testing "an explicit-type teaching error still names the offending type"
      (is (re-find #"Remove database from type"
                   (try (validate-filters! {:created_by "me" :type ["database"]})
                        (catch clojure.lang.ExceptionInfo e (ex-message e))))))
    (testing "the explicit-type teaching error is a 400"
      (is (= 400 (:status-code (ex-data (try (validate-filters! {:created_by "me" :type ["database"]})
                                             (catch clojure.lang.ExceptionInfo e e)))))))))

(deftest snippet-rows-does-not-load-content-test
  (testing "GHY-4137: snippet-rows must not pull the SQL body (:content) into the heap — it needs
            only id/name/description for output and :collection_id for the can-read? check"
    (let [captured (atom nil)]
      (with-redefs [t2/select (fn [model & _] (reset! captured model) [])]
        (#'tools.search/snippet-rows [] false))
      (is (vector? @captured)
          "the select is column-scoped (a [model & cols] vector), not the bare model keyword")
      (let [cols (set (rest @captured))]
        (is (contains? cols :collection_id) "collection_id is selected — can-read? consults it")
        (is (not (contains? cols :content)) "the SQL body column is not selected")))))

(deftest snippet-rows-are-permission-filtered-test
  (testing "GHY-4137: `mi/can-read?` in snippet-rows is the ONLY permission check on snippet results —
            snippets are not in the search index, so nothing upstream filters them. In OSS that check is
            native-query permission on any database; without it every agent:content:read caller would see
            every snippet name and description in the instance."
    (mt/with-temp [:model/NativeQuerySnippet _ {:name "mcp-perm-probe-snippet" :content "WHERE 1=1"}]
      (testing "a caller with native-query permission sees it"
        (mt/with-test-user :crowberto
          (is (some #(= "mcp-perm-probe-snippet" (:name %))
                    (#'tools.search/snippet-rows [] false)))))
      (testing "a caller without it sees nothing — and the name never crosses the boundary"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-test-user :rasta
            (let [rows (#'tools.search/snippet-rows [] false)]
              (is (not (some #(= "mcp-perm-probe-snippet" (:name %)) rows))))))))))

;; not ^:parallel: the `!` in validate-modes! trips the kondo deftest lint
(deftest query-limits-test
  (testing "GHY-4137: each query list is length-capped and each query is char-bounded, so one call
            can't fan out into hundreds of concurrent searches — the MCP throttler counts requests,
            not the queries inside one"
    (testing "more than 10 term_queries is a teaching error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"at most 10"
                            (validate-modes! {:term_queries (vec (repeat 11 "x"))} true false))))
    (testing "more than 10 semantic_queries is a teaching error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"at most 10"
                            (validate-modes! {:semantic_queries (vec (repeat 11 "x"))} true false))))
    (testing "exactly 10 per list is allowed"
      (is (some? (validate-modes! {:term_queries (vec (repeat 10 "x"))
                                   :semantic_queries (vec (repeat 10 "y"))} true false))))
    (testing "a query longer than 500 characters is a teaching error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"at most 500 characters"
                            (validate-modes! {:term_queries [(apply str (repeat 501 "a"))]} true false))))
    (testing "a 500-character query is allowed"
      (is (some? (validate-modes! {:term_queries [(apply str (repeat 500 "a"))]} true false))))))

;; not ^:parallel: the `!` in validate-modes! trips the kondo deftest lint
(deftest blank-query-is-rejected-test
  (testing "GHY-4137: a whitespace-only query passes the {:min 1} schema, but Postgres treats a
            blank search string as match-all — so a blank query silently becomes an unscoped
            listing. It is a teaching error instead."
    (testing "a whitespace-only term query is rejected"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"blank|empty"
                            (validate-modes! {:term_queries [" "]} true false))))
    (testing "a whitespace-only semantic query is rejected"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"blank|empty"
                            (validate-modes! {:semantic_queries ["\t"]} true false))))
    (testing "a blank query mixed with a real one is still rejected — it would broaden the whole call"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"blank|empty"
                            (validate-modes! {:term_queries ["sales" "  "]} true false))))
    (testing "a real query with incidental surrounding whitespace is fine"
      (is (some? (validate-modes! {:term_queries [" sales "]} true false))))
    (testing "the teaching error is a 400"
      (is (= 400 (:status-code (ex-data (try (validate-modes! {:term_queries [" "]} true false)
                                             (catch clojure.lang.ExceptionInfo e e)))))))))

(deftest resolve-collection-filter-delegates-sentinels-test
  (testing "GHY-4137: resolve-collection-filter delegates sentinel handling to
            common/resolve-collection-id instead of a local set — so \"trash\" gets its specific
            teaching error rather than a generic invalid-id, and nil/\"root\" still mean no scoping"
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "\"trash\" is the specific teaching error"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not a valid collection here"
                              (resolve-collection-filter "trash"))))
      (testing "nil and \"root\" resolve to nil (no scoping)"
        (is (nil? (resolve-collection-filter nil)))
        (is (nil? (resolve-collection-filter "root")))))))

;; not ^:parallel: the `!` in validate-modes! trips the kondo deftest lint
(deftest filters-only-redirects-to-browse-test
  (testing "GHY-4137: a call with filters but no query is a listing, not a search — the search tool
            now redirects it to the browse_* tools rather than running a query-less engine search
            (whose order is arbitrary without a relevance anchor and whose total is ranking-capped)"
    (testing "a collection listing routes to browse_collection with that id"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"browse_collection\(id: "
                            (validate-modes! {:type ["dashboard"] :collection_id "someEntityId01234567_"} false true))))
    (testing "a snippet listing routes to the snippets namespace"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"namespace: \"snippets\""
                            (validate-modes! {:type ["snippet"]} false true))))
    (testing "a transform listing routes to the transforms namespace"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"namespace: \"transforms\""
                            (validate-modes! {:type ["transform"]} false true))))
    (testing "a created_by listing routes to browse_collection with created_by"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"created_by"
                            (validate-modes! {:created_by "me"} false true))))
    (testing "an archived listing routes to the trash"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"trash"
                            (validate-modes! {:archived true} false true))))
    (testing "a data-source listing routes to browse_data"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"browse_data"
                            (validate-modes! {:type ["table"]} false true))))
    (testing "a search that carries a query plus filters is not redirected"
      (is (some? (validate-modes! {:term_queries ["sales"] :type ["dashboard"]} true true))))
    (testing "the redirect is a 400 teaching error"
      (is (= 400 (:status-code (ex-data (try (validate-modes! {:type ["dashboard"]} false true)
                                             (catch clojure.lang.ExceptionInfo e e)))))))))

(defn- nothing-to-search?
  "True when the search handler rejects `args` with the \"Nothing to search for\" teaching error.
   A non-matching failure (e.g. the engine's \"No current user\") means validation was passed."
  [args]
  (try
    (tools.search/search-tool args {:token-scopes #{"agent:content:read"}})
    false
    (catch clojure.lang.ExceptionInfo e
      (boolean (re-find #"Nothing to search for" (ex-message e))))))

(deftest ^:parallel collection-id-root-alone-is-empty-request-test
  (testing "GHY-4137: \"root\" is inert everywhere — as the *only* argument it scopes nothing, so
            the request has no query and no real filter and is rejected as empty rather than
            listing the entire instance"
    (is (nothing-to-search? {:collection_id "root"}))
    (is (nothing-to-search? {}) "sanity: a truly empty request is also rejected"))
  (testing "\"root\" combined with a real query is a valid search — it passes validation"
    (is (not (nothing-to-search? {:collection_id "root" :term_queries ["sales"]}))))
  (testing "\"root\" with only a filter is a browse redirect, not a query-less search"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"browse_"
                          (tools.search/search-tool {:collection_id "root" :type ["dashboard"]}
                                                    {:token-scopes #{"agent:content:read"}})))))

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

(def ^:private recents-page
  #'tools.search/recents-page)

(deftest recents-without-a-type-returns-every-tracked-model-test
  (testing "GHY-4137: `recent: true` with no `type` lists every tracked model. `recents-page` maps
            an absent `type` to an empty `:models` vector, which `get-recents` passes to `do-query`
            — where `(when (seq db-models) ...)` omits the model filter entirely rather than
            filtering to nothing. Pinned because the empty-vector-means-everything step is invisible
            at this call site: tightening it into a real `IN ()` would silently return no recents."
    (mt/with-temp [:model/Card      {card-id :id} {:name "Recent Card"}
                   :model/Dashboard {dash-id :id} {:name "Recent Dashboard"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-model-cleanup [:model/RecentViews]
          (activity-feed/update-users-recent-views! (mt/user->id :crowberto) :model/Card card-id :view)
          (activity-feed/update-users-recent-views! (mt/user->id :crowberto) :model/Dashboard dash-id :view)
          (let [{:keys [rows]} (recents-page {} :concise 50 0)
                ids            (set (map :id rows))]
            (is (contains? ids card-id) "the card is listed with no type filter")
            (is (contains? ids dash-id) "the dashboard is listed with no type filter")))))))

(deftest recents-total-is-a-floor-test
  (testing "GHY-4137: RecentViews retains at most 20 rows per user per model per context
            ([[metabase.activity-feed.models.recent-views/*recent-views-stored-per-user-per-model*]])
            and silently drops unreadable/inconsistent rows, so `recents-page`'s `:total` (the size
            of that already-capped, already-filtered set) is a lower bound on how much the user has
            actually viewed — never an exact count. The engine branch already marks its total a floor
            for the analogous reason (the ranking-limit cap); the recents branch must match."
    ;; A fresh temp user, so no other test sharing the app db can have viewed anything as this user —
    ;; recents are per-user, so an isolated user makes the count deterministic under parallel CI.
    (mt/with-temp [:model/User {uid :id} {}]
      (mt/with-model-cleanup [:model/Card :model/RecentViews]
        ;; One more card than the per-model cap, so the cap binds regardless of anything else.
        (let [card-ids (mapv (fn [i]
                               (t2/insert-returning-pk!
                                :model/Card {:name         (str "recents-floor-" i)
                                             :database_id  (mt/id)
                                             :creator_id   uid
                                             :type         :question
                                             :dataset_query {}
                                             :display      :table
                                             :visualization_settings {}}))
                             (range 21))
              cap       @#'recent-views/*recent-views-stored-per-user-per-model*]
          (mt/with-current-user uid
            (doseq [id card-ids]
              (activity-feed/update-users-recent-views! uid :model/Card id :view))
            (testing "recents-page: total is capped at the per-model retention limit even though 21 were viewed"
              (is (= cap (:total (recents-page {} :concise 10 0)))
                  "total equals the retention cap, not the 21 actually viewed"))
            (testing "the tool response marks the total as a floor — \"at least\", not an exact count"
              (let [content (tools.search/search-tool {:recent true :limit 10}
                                                      {:token-scopes #{"agent:content:read"}})
                    text    (-> content :content first :text)]
                (is (re-find (re-pattern (str "\"total\":" cap)) text))
                (is (re-find (re-pattern (str "Returned 10 of at least " cap)) text)
                    "the steering line must not assert the total is exact — this user viewed 21 cards")))))))))

(deftest recents-floor-line-renders-at-default-limit-test
  (testing "I6: at the DEFAULT limit (20), a user at the per-model retention cap gets a page that
            arithmetically looks whole — returned == total == 20 — so the ordinary truncation-line
            (which only fires when offset+limit < total) stays silent. Without a dedicated floor
            line the response reads \"total\":20,\"returned\":20 as an exact, exhausted count, when
            the user may have viewed far more than 20 and can never page past the cap. A prior fix
            covered this only at limit: 10, where the arithmetic truncation still fires normally."
    (mt/with-temp [:model/User {uid :id} {}]
      (mt/with-model-cleanup [:model/Card :model/RecentViews]
        (let [card-ids (mapv (fn [i]
                               (t2/insert-returning-pk!
                                :model/Card {:name         (str "recents-floor-default-" i)
                                             :database_id  (mt/id)
                                             :creator_id   uid
                                             :type         :question
                                             :dataset_query {}
                                             :display      :table
                                             :visualization_settings {}}))
                             (range 21))
              cap       @#'recent-views/*recent-views-stored-per-user-per-model*]
          (mt/with-current-user uid
            (doseq [id card-ids]
              (activity-feed/update-users-recent-views! uid :model/Card id :view))
            ;; No :limit passed — exercises the tool's own default (20), matching the cap exactly.
            (let [content (tools.search/search-tool {:recent true} {:token-scopes #{"agent:content:read"}})
                  text    (-> content :content first :text)]
              (is (re-find (re-pattern (str "\"returned\":" cap ",\"total\":" cap)) text)
                  "sanity: the page is arithmetically full at the default limit")
              (is (re-find (re-pattern (str "Returned " cap " of at least " cap)) text)
                  "the floor line must still render even though the page looks exhaustive")
              (is (re-find #"narrow with `type`" text)
                  "recents can't be paged past the cap, so it steers to narrowing, not an offset")
              (is (not (re-find #"offset:" text))
                  "no offset is offered — there is nothing stored beyond the cap to page to"))))))))

;; not ^:parallel: the `!` in validate-filters! trips the kondo deftest lint, and with-redefs stubs
;; a shared var
(deftest omitted-type-filter-narrows-instead-of-hard-failing-test
  (testing "I5: created_by/collection_id/archived with NO type is the most natural unscoped call
            (\"find my stuff\") — a prior fix widened the compatibility check to the full engine
            type set for this case but hard-failed the call instead of narrowing it, breaking the
            common case. The fix narrows to the supporting types and discloses it instead.
            metabot.search/search is stubbed (as in engine-results-reports-total-test) so this
            exercises validate-filters!'s narrowed :types actually reaching the engine call — not
            just validate-filters! in isolation — without depending on a materialized search index."
    (testing "created_by: \"me\" with no type reaches the engine with the narrowed types, returns
              results, and discloses the narrowing"
      (let [captured-entity-types (atom nil)]
        (with-redefs [metabot.search/search (fn [{:keys [entity-types]}]
                                              (reset! captured-entity-types entity-types)
                                              (with-meta [{:id 1 :type "question" :name "My I5 Card"}]
                                                         {:total 1}))]
          (mt/with-current-user (mt/user->id :rasta)
            (let [content (tools.search/search-tool {:term_queries ["I5"] :created_by "me"}
                                                    {:token-scopes #{"agent:content:read"}})
                  text    (-> content :content first :text)]
              (is (not (:isError content)) "the call must not 400")
              (is (= #{"action" "dashboard" "document" "measure" "metric" "model" "question"}
                     (set @captured-entity-types))
                  "the engine only received the creator-indexing types")
              (is (re-find #"\"name\":\"My I5 Card\"" text))
              (is (re-find #"created_by narrowed the search to" text)
                  "the narrowing is disclosed in the response text"))))))
    (testing "collection_id with no type reaches the engine with the narrowed types and discloses it"
      (let [captured-entity-types (atom nil)]
        (with-redefs [metabot.search/search (fn [{:keys [entity-types]}]
                                              (reset! captured-entity-types entity-types)
                                              (with-meta [] {:total 0}))]
          (mt/with-temp [:model/Collection {coll-id :id} {}]
            (mt/with-current-user (mt/user->id :crowberto)
              (let [content (tools.search/search-tool {:term_queries ["I5"] :collection_id coll-id}
                                                      {:token-scopes #{"agent:content:read"}})
                    text    (-> content :content first :text)]
                (is (not (:isError content)) "the call must not 400")
                (is (not (contains? (set @captured-entity-types) "database")))
                (is (not (contains? (set @captured-entity-types) "measure")))
                (is (not (contains? (set @captured-entity-types) "segment")))
                (is (re-find #"collection_id narrowed the search to" text))))))))
    (testing "archived: true with no type reaches the engine with the narrowed types, does not 400"
      (let [captured-entity-types (atom nil)]
        (with-redefs [metabot.search/search (fn [{:keys [entity-types]}]
                                              (reset! captured-entity-types entity-types)
                                              (with-meta [] {:total 0}))]
          (mt/with-current-user (mt/user->id :crowberto)
            (let [content (tools.search/search-tool {:term_queries ["x"] :archived true}
                                                    {:token-scopes #{"agent:content:read"}})
                  text    (-> content :content first :text)]
              (is (not (:isError content)) "the call must not 400")
              (is (not (contains? (set @captured-entity-types) "table")))
              (is (not (contains? (set @captured-entity-types) "database")))
              (is (not (contains? (set @captured-entity-types) "transform")))
              (is (re-find #"archived: true narrowed the search to" text)))))))
    (testing "naming an incompatible type explicitly is still a teaching error, and names the offending type"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Remove database from type"
                              (tools.search/search-tool {:term_queries ["x"] :type ["database"] :created_by "me"}
                                                        {:token-scopes #{"agent:content:read"}})))))))

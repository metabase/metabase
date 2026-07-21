(ns metabase-enterprise.content-diagnostics.imbalanced-test
  "Integration + serve-layer tests for the imbalanced family. The three finding types
  (`empty`/`sparse`/`crowded`) are produced by independent checkers, unit-tested in
  `checkers/imbalanced/{empty,sparse,crowded}_test`. This suite covers what spans them: cross-type
  co-occurrence on a single entity (there is no precedence, so one entity can carry several types at
  once), the `/imbalanced` umbrella endpoint (finding-types + count-bound filters, sort, pagination,
  permissions, breadcrumb/owner hydration), and per-type scan supersession."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- scope-prefix
  "Unique per-test entity-name prefix, passed as `:query` so assertions only see rows the test seeded -
  the findings table is shared across tests."
  []
  (str "cd-" (mt/random-name)))

(defn- imbalanced-findings-by-entity!
  "Run a scan and group its imbalanced (empty/sparse/crowded) findings as
  `{[entity-type entity-id] {finding-type finding}}` - the three checkers are independent, so one
  entity can carry several finding types at once."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (update-vals (group-by (juxt :entity_type :entity_id)
                           (t2/select :model/ContentDiagnosticsFinding
                                      :scan_id scan-id
                                      :finding_type [:in [:empty :sparse :crowded]]))
                 (fn [findings] (into {} (map (juxt :finding_type identity)) findings)))))

;;; --------------------------------------- cross-type co-occurrence ----------------------------------------
;;; The point of independent checkers: no precedence, so one entity can be flagged by several at once.
;;; The single-checker rules themselves are covered in the per-checker test namespaces.

(deftest imbalanced-collection-cooccurrence-test
  (testing "a collection can carry several imbalanced findings at once - the checkers share no precedence"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-collection-threshold-items 3
                                         content-diagnostics-sparse-collection-threshold-items  3]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [;; 4 empty dashboards: raw count 4 > 3 → crowded (and 4 is not < 3, so not sparse), while
             ;; the cascade sees no non-empty leaf → ALSO empty
             :model/Collection {crowded-empty :id} {}
             :model/Dashboard _ {:collection_id crowded-empty}
             :model/Dashboard _ {:collection_id crowded-empty}
             :model/Dashboard _ {:collection_id crowded-empty}
             :model/Dashboard _ {:collection_id crowded-empty}
             ;; an empty collection holding 1 item: empty via the cascade (its only leaf is empty) AND
             ;; sparse on the raw count of 1 (< 3)
             :model/Collection {parent :id} {}
             :model/Dashboard  _ {:collection_id parent}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "4 empty dashboards → crowded on the raw count AND empty via the cascade"
                (let [fs (by-entity [:collection crowded-empty])]
                  (is (= #{:empty :crowded} (set (keys fs))))
                  (is (= 4 (:content_count (:crowded fs))))
                  (is (= 0 (:content_count (:empty fs))))))
              (testing "an all-empty collection with 1 item is both empty (cascade) and sparse (raw count 1)"
                (let [fs (by-entity [:collection parent])]
                  (is (= #{:empty :sparse} (set (keys fs))))
                  (is (= 1 (:content_count (:sparse fs)))))))))))))

(deftest imbalanced-dashboard-cooccurrence-test
  (testing "a dashboard can be crowded on tabs while independently empty or sparse on dashcards"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab 2
                                         content-diagnostics-crowded-dashboard-threshold-tabs              2
                                         content-diagnostics-sparse-dashboard-threshold-dashcards          2]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             ;; 3 tabs (>2) holding 1 dashcard total (<2) → crowded (tabs) AND sparse
             :model/Dashboard    {tabs-sparse :id} {:collection_id coll}
             :model/DashboardTab {ts-t1 :id} {:dashboard_id tabs-sparse}
             :model/DashboardTab _ {:dashboard_id tabs-sparse}
             :model/DashboardTab _ {:dashboard_id tabs-sparse}
             :model/DashboardCard _ {:dashboard_id tabs-sparse :dashboard_tab_id ts-t1}
             ;; 3 empty tabs (>2), 0 dashcards → crowded (tabs) AND empty
             :model/Dashboard    {tabs-empty :id} {:collection_id coll}
             :model/DashboardTab _ {:dashboard_id tabs-empty}
             :model/DashboardTab _ {:dashboard_id tabs-empty}
             :model/DashboardTab _ {:dashboard_id tabs-empty}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "3 tabs with 1 dashcard total → crowded (tabs) AND sparse, independently"
                (let [fs (by-entity [:dashboard tabs-sparse])]
                  (is (= #{:crowded :sparse} (set (keys fs))))
                  (is (= "tabs" (get-in fs [:crowded :details :unit])))
                  (is (= 3 (:content_count (:crowded fs))))
                  (is (= 1 (:content_count (:sparse fs))))))
              (testing "3 empty tabs → crowded (tabs) AND empty, independently"
                (let [fs (by-entity [:dashboard tabs-empty])]
                  (is (= #{:crowded :empty} (set (keys fs))))
                  (is (= "tabs" (get-in fs [:crowded :details :unit]))))))))))))

;;; -------------------------------------------------- API -------------------------------------------------

(deftest imbalanced-api-feature-gated-test
  (testing "GET /imbalanced is gated on the :content-diagnostics premium feature"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "licensed → 200 with the paginated envelope"
        (mt/with-premium-features #{:content-diagnostics}
          (let [resp (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/imbalanced")]
            (is (contains? resp :data))
            (is (contains? resp :total)))))
      (testing "unlicensed → 402"
        (mt/with-premium-features #{}
          (mt/user-http-request :rasta :get 402 "ee/content-diagnostics/imbalanced"))))))

(defn- insert-imbalanced!
  "Insert one imbalanced finding row directly (API tests exercise the read path, not the checker)."
  [{:keys [entity-type entity-id name finding-type content-count details]
    :or   {details {:threshold 5 :unit "items"}}}]
  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                   {:scan_id       "imb-api"
                                    :entity_type   entity-type
                                    :entity_id     entity-id
                                    :entity_name   name
                                    :finding_type  finding-type
                                    :content_count content-count
                                    :details       details})))

(deftest imbalanced-api-finding-types-and-count-bounds-test
  (testing "GET /imbalanced narrows by finding-types (default all three) and min-/max-content-count (inclusive)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c1 :id} {:collection_id coll}
                         :model/Card {c2 :id} {:collection_id coll}
                         :model/Dashboard {d1 :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix      (scope-prefix)
                  empty-fid   (insert-imbalanced! {:entity-type :card :entity-id c1
                                                   :name (str prefix " Empty") :finding-type :empty
                                                   :content-count 0})
                  sparse-fid  (insert-imbalanced! {:entity-type :dashboard :entity-id d1
                                                   :name (str prefix " Sparse") :finding-type :sparse
                                                   :content-count 2})
                  crowded-fid (insert-imbalanced! {:entity-type :card :entity-id c2
                                                   :name (str prefix " Crowded") :finding-type :crowded
                                                   :content-count 30})
                  ids         (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                      "ee/content-diagnostics/imbalanced"
                                                                      :query prefix kvs)))))]
              (testing "omitted → all three finding types"
                (is (= #{empty-fid sparse-fid crowded-fid} (ids))))
              (testing "one type"
                (is (= #{empty-fid} (ids :finding-types "empty"))))
              (testing "two types"
                (is (= #{sparse-fid crowded-fid} (ids :finding-types ["sparse" "crowded"]))))
              (testing "min-content-count is an inclusive floor"
                (is (= #{sparse-fid crowded-fid} (ids :min-content-count "2")))
                (is (= #{crowded-fid} (ids :min-content-count "3"))))
              (testing "max-content-count is an inclusive ceiling"
                (is (= #{empty-fid sparse-fid} (ids :max-content-count "2")))
                (is (= #{empty-fid} (ids :max-content-count "0"))))
              (testing "floor + ceiling compose"
                (is (= #{sparse-fid} (ids :min-content-count "1" :max-content-count "5")))))))))))

(deftest imbalanced-api-multiple-types-per-entity-test
  (testing "one entity surfaces once per finding type - there is no read-time dedup across the umbrella"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix      (scope-prefix)
                  empty-fid   (insert-imbalanced! {:entity-type :collection :entity-id coll
                                                   :name (str prefix " Coll") :finding-type :empty
                                                   :content-count 0})
                  crowded-fid (insert-imbalanced! {:entity-type :collection :entity-id coll
                                                   :name (str prefix " Coll") :finding-type :crowded
                                                   :content-count 150})
                  fetch       (fn [& kvs] (apply mt/user-http-request :rasta :get 200
                                                 "ee/content-diagnostics/imbalanced" :query prefix kvs))]
              (testing "both rows serve by default; total counts findings, not entities"
                (let [resp (fetch)]
                  (is (= #{empty-fid crowded-fid} (set (map :id (:data resp)))))
                  (is (= 2 (:total resp)))))
              (testing "finding-types narrows within the entity's rows"
                (is (= #{crowded-fid} (set (map :id (:data (fetch :finding-types "crowded"))))))))))))))

(deftest imbalanced-api-entity-types-filter-test
  (testing "GET /imbalanced filters by entity-types, including the collection subject"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {card-id :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix   (scope-prefix)
                  card-fid (insert-imbalanced! {:entity-type :card :entity-id card-id
                                                :name (str prefix " Card") :finding-type :empty
                                                :content-count 0})
                  coll-fid (insert-imbalanced! {:entity-type :collection :entity-id coll
                                                :name (str prefix " Coll") :finding-type :sparse
                                                :content-count 1})
                  ids      (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                   "ee/content-diagnostics/imbalanced"
                                                                   :query prefix kvs)))))]
              (testing "omitted → all entity types"
                (is (= #{card-fid coll-fid} (ids))))
              (testing "collection only"
                (is (= #{coll-fid} (ids :entity-types "collection"))))
              (testing "multiple values"
                (is (= #{card-fid coll-fid} (ids :entity-types ["card" "collection"])))))))))))

(deftest imbalanced-api-sort-test
  (testing "GET /imbalanced sorts by content-count and name, both directions"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c1 :id} {:collection_id coll}
                         :model/Card {c2 :id} {:collection_id coll}
                         :model/Card {c3 :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix (scope-prefix)
                  a-fid  (insert-imbalanced! {:entity-type :card :entity-id c1 :finding-type :sparse
                                              :name (str prefix " Alpha") :content-count 20})
                  b-fid  (insert-imbalanced! {:entity-type :card :entity-id c2 :finding-type :sparse
                                              :name (str prefix " Beta") :content-count 5})
                  g-fid  (insert-imbalanced! {:entity-type :card :entity-id c3 :finding-type :sparse
                                              :name (str prefix " Gamma") :content-count 10})
                  order  (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                             "ee/content-diagnostics/imbalanced"
                                                             :query prefix kvs))))]
              (testing "content-count asc/desc (isolated from the name order)"
                (is (= [b-fid g-fid a-fid] (order :sort-column "content-count" :sort-direction "asc")))
                (is (= [a-fid g-fid b-fid] (order :sort-column "content-count" :sort-direction "desc"))))
              (testing "name asc/desc"
                (is (= [a-fid b-fid g-fid] (order :sort-column "name" :sort-direction "asc")))
                (is (= [g-fid b-fid a-fid] (order :sort-column "name" :sort-direction "desc")))))))))))

(deftest imbalanced-api-paginates-test
  (testing "GET /imbalanced honors limit/offset and reports the full valid total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c1 :id} {:collection_id coll}
                         :model/Card {c2 :id} {:collection_id coll}
                         :model/Card {c3 :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix (scope-prefix)]
              (doseq [cid [c1 c2 c3]]
                (insert-imbalanced! {:entity-type :card :entity-id cid :finding-type :empty
                                     :name (str prefix "-" cid) :content-count 0}))
              (let [page (fn [limit offset]
                           (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/imbalanced"
                                                 :query prefix :limit limit :offset offset))]
                (testing "limit caps the page; total reflects the full valid set; limit/offset echoed back"
                  (let [r (page 2 0)]
                    (is (= 2 (count (:data r))))
                    (is (= 3 (:total r)))
                    (is (= 2 (:limit r)))
                    (is (= 0 (:offset r)))))
                (testing "offset advances to the remainder"
                  (is (= 1 (count (:data (page 2 2))))))))))))))

(deftest imbalanced-api-does-not-leak-across-finding-types-test
  (testing "imbalanced rows never surface in /stale or /slow, and their rows never surface in /imbalanced"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c-stale :id} {:collection_id coll}
                         :model/Card {c-slow :id}  {:collection_id coll}
                         :model/Card {c-imb :id}   {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix    (scope-prefix)
                  stale-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id c-stale
                                                              :entity_name (str prefix "-stale")
                                                              :finding_type :stale :details {:threshold_days 90}}))
                  slow-fid  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id c-slow
                                                              :entity_name (str prefix "-slow")
                                                              :finding_type :slow :duration_ms 20000
                                                              :details {:threshold_ms 15000}}))
                  imb-fid   (insert-imbalanced! {:entity-type :card :entity-id c-imb :finding-type :empty
                                                 :name (str prefix "-imb") :content-count 0})
                  ids       (fn [path] (set (map :id (:data (mt/user-http-request :rasta :get 200 path
                                                                                  :query prefix)))))]
              (testing "/imbalanced returns only the imbalanced finding"
                (is (= #{imb-fid} (ids "ee/content-diagnostics/imbalanced"))))
              (testing "/stale returns only the stale finding"
                (is (= #{stale-fid} (ids "ee/content-diagnostics/stale"))))
              (testing "/slow returns only the slow finding"
                (is (= #{slow-fid} (ids "ee/content-diagnostics/slow")))))))))))

(deftest imbalanced-api-collection-subject-permissions-test
  (testing "a collection finding is served only when the caller can read the collection ITSELF"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {readable :id}   {}
                         :model/Collection {unreadable :id} {}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (let [prefix  (scope-prefix)
                  r-fid   (insert-imbalanced! {:entity-type :collection :entity-id readable
                                               :name (str prefix " Readable")
                                               :finding-type :sparse :content-count 1})
                  u-fid   (insert-imbalanced! {:entity-type :collection :entity-id unreadable
                                               :name (str prefix " Unreadable")
                                               :finding-type :sparse :content-count 1})
                  ids-for (fn [user] (set (map :id (:data (mt/user-http-request
                                                           user :get 200 "ee/content-diagnostics/imbalanced"
                                                           :query prefix)))))]
              (testing "non-admin sees only the readable collection's finding"
                (let [ids (ids-for :rasta)]
                  (is (contains? ids r-fid))
                  (is (not (contains? ids u-fid)))))
              (testing "superuser sees both"
                (let [ids (ids-for :crowberto)]
                  (is (contains? ids r-fid))
                  (is (contains? ids u-fid)))))))))))

(deftest imbalanced-api-personal-collection-subject-test
  (testing "a personal collection's own finding is excluded by default, returned with include-personal-collections=true, and hydrates owner (not creator)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))
                prefix  (scope-prefix)
                fid     (insert-imbalanced! {:entity-type :collection :entity-id pers-id
                                             :name (str prefix " Personal") :finding-type :sparse
                                             :content-count 1})
                fetch   (fn [& kvs] (apply mt/user-http-request :rasta :get 200
                                           "ee/content-diagnostics/imbalanced" :query prefix kvs))]
            (testing "default (param omitted) → the personal collection's finding is excluded"
              (is (empty? (:data (fetch))))
              (is (zero? (:total (fetch)))))
            (testing "include-personal-collections=true → returned (bounded by visibility - it is rasta's own)"
              (let [row (first (filter #(= fid (:id %)) (:data (fetch :include-personal-collections true))))]
                (is (some? row))
                (testing "owner = the owning user; creator stays null (collections have no creator)"
                  (is (=? {:id   (mt/user->id :rasta)
                           :type "user"}
                          (get-in row [:details :owner])))
                  (is (nil? (get-in row [:details :creator]))))
                (testing "a root-level personal collection has no parent → breadcrumb null"
                  (is (nil? (get-in row [:details :collection]))))))))))))

(deftest imbalanced-api-collection-breadcrumb-is-parent-test
  (testing "a collection finding's breadcrumb is its PARENT collection; null at root; content_count stays top-level"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {parent :id} {:name "Parent Coll"}
                         :model/Collection {child :id}  {:location (collection/location-path parent)}
                         :model/Collection {rooted :id} {}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) parent)
            (let [prefix     (scope-prefix)
                  child-fid  (insert-imbalanced! {:entity-type :collection :entity-id child
                                                  :name (str prefix " Child") :finding-type :sparse
                                                  :content-count 2})
                  rooted-fid (insert-imbalanced! {:entity-type :collection :entity-id rooted
                                                  :name (str prefix " Rooted") :finding-type :sparse
                                                  :content-count 2})
                  rows       (:data (mt/user-http-request :crowberto :get 200
                                                          "ee/content-diagnostics/imbalanced" :query prefix))
                  row-for    (fn [fid] (first (filter #(= fid (:id %)) rows)))]
              (testing "nested collection → the parent's breadcrumb"
                (let [row (row-for child-fid)]
                  (is (= parent (get-in row [:details :collection :id])))
                  (is (= "Parent Coll" (get-in row [:details :collection :name])))))
              (testing "root-level collection → collection null"
                (is (nil? (get-in (row-for rooted-fid) [:details :collection]))))
              (testing "content_count is hoisted top-level, never duplicated inside details"
                (let [row (row-for child-fid)]
                  (is (= 2 (:content_count row)))
                  (is (not (contains? (:details row) :content_count))))))))))))

(deftest imbalanced-api-unreadable-parent-breadcrumb-test
  (testing "a readable collection under an unreadable parent serves its finding with a null breadcrumb - the parent's name never leaks"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {hidden-parent :id} {:name "Hidden Parent"}
                         :model/Collection {child :id} {:location (collection/location-path hidden-parent)}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) child)
            (let [prefix  (scope-prefix)
                  fid     (insert-imbalanced! {:entity-type :collection :entity-id child
                                               :name (str prefix " Child") :finding-type :sparse
                                               :content-count 1})
                  row-for (fn [user]
                            (->> (mt/user-http-request user :get 200
                                                       "ee/content-diagnostics/imbalanced" :query prefix)
                                 :data
                                 (filter #(= fid (:id %)))
                                 first))]
              (testing "the finding itself is served - the subject collection is readable"
                (is (some? (row-for :rasta))))
              (testing "the unreadable parent degrades to a null breadcrumb, same as root"
                (is (nil? (get-in (row-for :rasta) [:details :collection]))))
              (testing "an admin still gets the parent breadcrumb"
                (is (= hidden-parent (get-in (row-for :crowberto) [:details :collection :id])))))))))))

;;; --------------------------------------------- scan supersession ----------------------------------------

(deftest imbalanced-scan-shares-batch-and-supersedes-per-type-test
  (testing "one scan writes stale + imbalanced in a single scan_id batch; a rescan supersedes a resolved sparse finding while the still-stale entity stays active"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll :id} {}
                       :model/Card {stale-card :id} {:collection_id coll
                                                     :last_used_at (t/minus (t/offset-date-time) (t/days 400))}]
          (let [scan-1     (:scan_id (scan/scan!))
                sparse-row (t2/select-one :model/ContentDiagnosticsFinding
                                          :entity_type :collection :entity_id coll :finding_type :sparse)
                stale-row  (t2/select-one :model/ContentDiagnosticsFinding
                                          :entity_type :card :entity_id stale-card :finding_type :stale)]
            (testing "the collection's sparse finding and the card's stale finding share one scan_id batch"
              (is (some? sparse-row))
              (is (some? stale-row))
              (is (= scan-1 (:scan_id sparse-row) (:scan_id stale-row))))
            ;; resolve the sparseness by lowering the bound (1 item is no longer < 1); the card stays stale
            (mt/with-temporary-setting-values [content-diagnostics-sparse-collection-threshold-items 1]
              (scan/scan!))
            (testing "the resolved sparse finding is soft-invalidated"
              (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding
                                                         :id (:id sparse-row))))))
            (testing "the still-stale entity keeps an active stale finding (per-type supersession)"
              (is (seq (t2/select :model/ContentDiagnosticsFinding
                                  :entity_type :card :entity_id stale-card
                                  :finding_type :stale :invalidated_at nil))))))))))

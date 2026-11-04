(ns ^:synchronized metabase-enterprise.content-diagnostics.scan-api-integration-test
  "Scan → HTTP API flows: archived content exclusion, dismissing and trashing findings, analyst
  permissions and `can_write`, rescan after fixes/deletes, and search/filter/sort/paginate. Each test
  drives a real `scan/scan!` and reads the result back over HTTP. Findings are scoped to a unique
  name prefix because the findings table is shared."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase-enterprise.content-diagnostics.test-util :as cd.tu]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each cd.tu/with-authorized-reader!)

(defn- scope-prefix [] (str "cdp-" (mt/random-name)))

(defn- list-empty
  "GET /imbalanced restricted to `empty` findings scoped to `prefix`."
  [user prefix & kvs]
  (apply mt/user-http-request user :get 200 "ee/content-diagnostics/imbalanced"
         :finding-types "empty" :query prefix kvs))

(defn- names [resp] (set (map :entity_display_name (:data resp))))

(def ^:private empty-doc {:type "doc" :content []})

;;; ARC-1, ARC-2
(deftest archived-content-is-not-reported-test
  (testing "live empty collection/dashboard/document are reported; archived counterparts are not"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [p (scope-prefix)
              n #(str p " " %)]
          (mt/with-temp [:model/Collection _ {:name (n "live coll")}
                         :model/Dashboard  _ {:name (n "live dash")}
                         :model/Document   _ {:name (n "live doc") :document empty-doc}
                         :model/Collection _ {:name (n "trashed coll") :archived true}
                         :model/Dashboard  _ {:name (n "trashed dash") :archived true}
                         :model/Document   _ {:name (n "trashed doc") :document empty-doc :archived true}]
            (scan/scan!)
            (is (= #{(n "live coll") (n "live dash") (n "live doc")}
                   (names (list-empty :crowberto p))))))))))

;;; BD-3, BD-5, BD-7
(deftest dismissing-findings-clears-the-list-without-archiving-test
  (testing "POST /invalidate drops the findings from the list (total 0) and leaves the dashboards unarchived"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [p (scope-prefix)]
          (mt/with-temp [:model/Dashboard {d1 :id} {:name (str p " first")}
                         :model/Dashboard {d2 :id} {:name (str p " second")}]
            (scan/scan!)
            (let [{:keys [data total]} (list-empty :crowberto p)
                  ids                  (mapv :id data)]
              (is (= 2 total))
              (is (= {:invalidated ids :skipped []}
                     (mt/user-http-request :crowberto :post 200 "ee/content-diagnostics/invalidate" {:ids ids})))
              (let [after (list-empty :crowberto p)]
                (is (= 0 (:total after)))
                (is (empty? (:data after))))
              (is (= [false false] (mapv #(t2/select-one-fn :archived :model/Dashboard :id %) [d1 d2]))))))))))

;;; BT-4
(deftest trashing-dashboards-drops-their-findings-test
  (testing "archiving flagged dashboards through the API invalidates their findings"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [p (scope-prefix)]
          (mt/with-temp [:model/Dashboard {d1 :id} {:name (str p " first")}
                         :model/Dashboard {d2 :id} {:name (str p " second")}]
            (scan/scan!)
            (is (= 2 (:total (list-empty :crowberto p))))
            (doseq [d [d1 d2]]
              (mt/user-http-request :crowberto :put 200 (str "dashboard/" d) {:archived true}))
            (is (= 0 (:total (list-empty :crowberto p))))))))))

;;; BT-5, BT-6, BT-7, PE-3, PE-4
(deftest analyst-sees-readable-findings-with-write-flag-test
  (testing "an analyst gets findings for readable dashboards only; can_write (the FE trash gate) tracks curate access"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [p (scope-prefix)]
            (mt/with-temp [:model/Collection {writable :id} {}
                           :model/Collection {readonly :id} {}
                           :model/Collection {hidden :id}   {}
                           :model/Dashboard  _ {:name (str p " writable") :collection_id writable}
                           :model/Dashboard  _ {:name (str p " readonly") :collection_id readonly}
                           :model/Dashboard  _ {:name (str p " hidden")   :collection_id hidden}]
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) writable)
              (perms/grant-collection-read-permissions! (perms/all-users-group) readonly)
              (scan/scan!)
              (let [resp   (list-empty :rasta p)
                    by-name (into {} (map (juxt :entity_display_name :can_write)) (:data resp))]
                (testing "hidden dashboard is not listed (PE-4); both readable ones are (PE-3, BT-5)"
                  (is (= #{(str p " writable") (str p " readonly")} (set (keys by-name)))))
                (testing "can_write: true for the writable one, false for the read-only one (BT-6)"
                  (is (true? (get by-name (str p " writable"))))
                  (is (false? (get by-name (str p " readonly")))))
                (testing "the analyst can still dismiss both (BT-7)"
                  (let [ids (mapv :id (:data resp))]
                    (is (= {:invalidated ids :skipped []}
                           (mt/user-http-request :rasta :post 200 "ee/content-diagnostics/invalidate"
                                                 {:ids ids})))))))))))))

;;; RS-1, RS-2, RS-3
(deftest rescan-drops-fixed-and-deleted-findings-test
  (testing "a rescan drops a collection that gained an item and a dashboard that was hard-deleted"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [p (scope-prefix)]
          (mt/with-temp [:model/Collection {coll :id} {:name (str p " coll")}
                         :model/Dashboard  {dash :id} {:name (str p " dash")}]
            (scan/scan!)
            (is (= #{(str p " coll") (str p " dash")} (names (list-empty :crowberto p))))
            (mt/with-temp [:model/Card _ {:collection_id coll}]
              (mt/user-http-request :crowberto :delete 204 (str "dashboard/" dash))
              (scan/scan!)
              (is (= #{} (names (list-empty :crowberto p)))))))))))

;;; TO-1, TO-2, TO-3, TO-5, TO-6, TO-7, TO-8
(deftest table-operations-on-imbalanced-test
  (testing "query, entity-types, personal-collection, sort and pagination params over a real scan"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding :model/Dashboard]
        (let [p        (scope-prefix)
              term     (str p " tableops")
              dname    #(format "%s dashboard %02d" term %)
              personal (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
          (mt/with-temp [:model/Collection _ {:name (str term " collection")}
                         :model/Dashboard  _ {:name (str term " personal dashboard") :collection_id personal}
                         :model/Dashboard  _ {:name (str p " zzdecoy dashboard")}]
            (doseq [i (range 1 27)]
              (t2/insert! :model/Dashboard {:name (dname i) :creator_id (mt/user->id :crowberto)
                                            :parameters []}))
            (scan/scan!)
            (let [all          (fn [q & kvs] (apply list-empty :crowberto q :include-personal-collections true kvs))
                  sorted-names (fn [& kvs] (mapv :entity_display_name (:data (apply all term :sort-column "name" kvs))))]
              (testing "TO-1: searching the decoy's term finds the decoy and nothing else"
                (is (= #{(str p " zzdecoy dashboard")} (names (all (str p " zzdecoy"))))))
              (testing "TO-2: searching the shared term finds 28 findings and not the decoy"
                (let [resp (all term :limit 100)]
                  (is (= 28 (:total resp)))
                  (is (not (contains? (names resp) (str p " zzdecoy dashboard"))))))
              (testing "TO-3: entity-types=collection leaves only the collection"
                (is (= #{(str term " collection")} (names (all term :entity-types "collection")))))
              (testing "TO-5: excluding personal collections drops the personal dashboard (total 27)"
                (let [resp (list-empty :crowberto term :limit 100)]
                  (is (= 27 (:total resp)))
                  (is (not (contains? (names resp) (str term " personal dashboard"))))))
              (testing "TO-6/TO-7: name asc / desc"
                (let [asc  (sorted-names :sort-direction "asc" :limit 100)
                      desc (sorted-names :sort-direction "desc" :limit 100)]
                  (is (= 28 (count asc)))
                  (is (= (sort asc) asc))
                  (is (= (reverse asc) desc))
                  (is (= (dname 1) (second asc)) "collection sorts first, dashboard 01 next")
                  (is (= (str term " personal dashboard") (last asc)))
                  (is (= (str term " personal dashboard") (first desc)))))
              (testing "TO-8: pages of 25 by name asc; total stays 28"
                (let [page  (fn [offset] (apply all term :sort-column "name" :sort-direction "asc"
                                                [:limit 25 :offset offset]))
                      page1 (mapv :entity_display_name (:data (page 0)))
                      page2 (mapv :entity_display_name (:data (page 25)))]
                  (is (= 28 (:total (page 0)) (:total (page 25))))
                  (is (some #{(dname 1)} page1))
                  (is (not-any? #{(dname 26)} page1))
                  (is (some #{(dname 26)} page2))
                  (is (not-any? #{(dname 1)} page2)))))))))))

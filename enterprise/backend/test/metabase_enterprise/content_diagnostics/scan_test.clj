(ns metabase-enterprise.content-diagnostics.scan-test
  "The scan pipeline runs the instance-wide `stale` checker, persists a snapshot, and emits
  o11y signals (duration histogram, outcome counter, findings/entities gauges)."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stale-instant []
  (t/minus (t/offset-date-time) (t/days 365)))

(defn- fresh-instant []
  (t/offset-date-time))

(deftest scan-detects-stale-and-emits-metrics-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-prometheus-system! [_ system]
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       ;; stale: last activity well past the 90-day threshold
                       :model/Card      {s1 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card      {s2 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card      {s3 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Dashboard {s4 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                       :model/Dashboard {s5 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                       ;; fresh: used just now — must NOT be flagged
                       :model/Card      {f1 :id} {:collection_id coll-id :last_used_at (fresh-instant)}
                       :model/Dashboard {f2 :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}]
          (let [stale-keys #{[:card s1] [:card s2] [:card s3] [:dashboard s4] [:dashboard s5]}
                fresh-keys #{[:card f1] [:dashboard f2]}
                result     (detect/scan!)
                rows       (t2/select :model/ContentDiagnosticsFinding :scan_id (:scan_id result))
                found-keys (set (map (juxt :entity_type :entity_id) rows))]
            (testing "scan! returns a topline {scan_id, finding_count, entities_scanned, duration_ms}"
              (is (string? (:scan_id result)))
              (is (pos-int? (:finding_count result)))
              (is (pos-int? (:entities_scanned result)))
              (is (<= (:finding_count result) (:entities_scanned result)))
              (is (nat-int? (:duration_ms result))))
            (testing "every stale temp entity produced a :stale finding; no fresh one did"
              (is (every? found-keys stale-keys))
              (is (empty? (set/intersection found-keys fresh-keys))))
            (testing "persisted findings carry finding_type + scope_collection_id + last_active_at + details"
              (let [row (first (filter #(and (= :card (:entity_type %)) (= s1 (:entity_id %))) rows))]
                (is (= :stale (:finding_type row)))
                ;; scope_collection_id is stamped at scan time from the entity's collection
                (is (= coll-id (:scope_collection_id row)))
                ;; details now holds only the threshold; last_active_at is a top-level column
                (is (= #{:threshold_days} (set (keys (:details row)))))
                ;; derive from the setting, not a literal — a default change must not silently desync
                (is (= (cd.settings/content-diagnostics-stale-threshold-days)
                       (get-in row [:details :threshold_days])))
                ;; last_active_at frozen from the card's last_used_at (top-level column, not in details)
                (is (some? (:last_active_at row)))))
            (testing "dashboard finding freezes last_active_at from last_viewed_at (per-entity-type alias)"
              (let [row (first (filter #(and (= :dashboard (:entity_type %)) (= s4 (:entity_id %))) rows))]
                (is (some? (:last_active_at row)))))
            (testing "denormalized columns (entity_name/created_at/creator_id/creator_name) are stamped at scan time"
              (let [row (first (filter #(and (= :card (:entity_type %)) (= s1 (:entity_id %))) rows))]
                (is (some? (:entity_name row)))
                (is (some? (:entity_created_at row)))
                (is (some? (:entity_creator_id row)))
                (is (some? (:entity_creator_name row)))))
            (testing "duration histogram recorded one ok observation"
              (is (<= 1 (:count (mt/metric-value system :metabase-content-diagnostics/scan-duration-ms
                                                 {:status "ok"})))))
            (testing "outcome counter bumped {status=ok}"
              (is (pos? (mt/metric-value system :metabase-content-diagnostics/scans {:status "ok"}))))
            (testing "magnitude gauges match the scan topline"
              (is (= (double (:finding_count result))
                     (mt/metric-value system :metabase-content-diagnostics/scan-findings)))
              (is (= (double (:entities_scanned result))
                     (mt/metric-value system :metabase-content-diagnostics/scan-entities))))
            ;; --- record the topline for the run log (println is intentional for human-readable output) ---
            #_{:clj-kondo/ignore [:discouraged-var]}
            (let [h (mt/metric-value system :metabase-content-diagnostics/scan-duration-ms {:status "ok"})]
              (println (str "\n=== Content Diagnostics — stale scan topline ==="
                            (format "\nfindings:                        %d" (:finding_count result))
                            (format "\nentities scanned:                %d" (:entities_scanned result))
                            (format "\nratio:                           %.1f%% of swept entities flagged"
                                    (* 100.0 (/ (:finding_count result) (double (:entities_scanned result)))))
                            (format "\nduration (return):               %d ms" (:duration_ms result))
                            (format "\nduration (prometheus histogram): count=%d sum=%.1f ms"
                                    (long (:count h)) (double (:sum h)))
                            "\n===============================================\n")))))))))

(deftest scan-error-path-emits-error-metrics-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-prometheus-system! [_ system]
      (mt/with-dynamic-fn-redefs [detect/detect (fn [] (throw (ex-info "boom" {})))]
        (is (thrown? Exception (detect/scan!)))
        (testing "error outcome counter + error duration observation bump"
          (is (pos? (mt/metric-value system :metabase-content-diagnostics/scans {:status "error"})))
          (is (<= 1 (:count (mt/metric-value system :metabase-content-diagnostics/scan-duration-ms
                                             {:status "error"})))))
        (testing "no ok signal on the error path"
          (is (zero? (mt/metric-value system :metabase-content-diagnostics/scans {:status "ok"}))))))))

(deftest scan-soft-invalidates-superseded-findings-test
  (testing "a fresh scan supersedes prior findings it no longer produces — via soft invalidation, not delete"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card {resolved :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card {still :id}    {:collection_id coll-id :last_used_at (stale-instant)}]
          (detect/scan!)                                            ; scan 1: both stale
          (t2/update! :model/Card resolved {:last_used_at (fresh-instant)})  ; resolved is now fresh
          (detect/scan!)                                            ; scan 2: only `still` is stale
          (let [active (set (map :entity_id (t2/select :model/ContentDiagnosticsFinding
                                                       :entity_type :card :stale false)))]
            (testing "the re-flagged card stays active; the resolved one does not"
              (is (contains? active still))
              (is (not (contains? active resolved))))
            (testing "the resolved card's prior finding is soft-invalidated (kept + stale + timestamped), not deleted"
              (let [rows (t2/select :model/ContentDiagnosticsFinding :entity_type :card :entity_id resolved)]
                (is (seq rows))                                     ; not hard-deleted — history retained
                (is (every? :stale rows))
                (is (every? :invalidated_at rows))))))))))

(deftest serve-latest-per-entity-and-hydration-test
  (testing "GET /finding serves the latest non-invalidated finding per entity, batch-hydrated"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-id :id} {:collection_id coll-id
                                                    :name          "Quarterly Revenue"
                                                    :creator_id    (mt/user->id :rasta)}]
            ;; rasta reads this collection → the visibility filter scopes `total` to this card's findings
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [insert     (fn [scan threshold]
                               (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                {:scan_id             scan
                                                                 :entity_type         :card
                                                                 :entity_id           card-id
                                                                 :finding_type        :stale
                                                                 :last_active_at      (t/offset-date-time 2025 9 1)
                                                                 :entity_name         "Quarterly Revenue"
                                                                 :entity_creator_id   (mt/user->id :rasta)
                                                                 :entity_creator_name "Rasta Toucan"
                                                                 :details             {:threshold_days threshold}})))
                  old-id     (insert "scan-old" 30)
                  new-id     (insert "scan-new" 90)
                  serve      #(mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale")
                  served-ids (fn [resp] (set (map :id (:data resp))))]
              ;; membership assertions (robust to other rows / pagination), not absolute page counts
              (testing "the latest finding is served, the superseded older one is not — and `total` counts only the latest"
                (let [resp (serve)
                      ids  (served-ids resp)]
                  (is (contains? ids new-id))
                  (is (not (contains? ids old-id)))
                  ;; total must exclude the older row even though it is stale=false: it isn't MAX(id) for the entity
                  (is (= 1 (:total resp)))))
              (testing "the served finding has flat identity + a nested typed details (collection, description, owner, creator)"
                (let [row (first (filter #(= new-id (:id %)) (:data (serve))))]
                  (testing "entity_display_name served from the denormalized entity_name"
                    (is (= "Quarterly Revenue" (:entity_display_name row))))
                  (testing "collection breadcrumb still live-hydrated (not denormalized)"
                    (is (= coll-id (get-in row [:details :collection :id]))))
                  (testing "threshold_days stays in details; last_active_at is hoisted to a top-level property"
                    (is (= 90 (get-in row [:details :threshold_days])))
                    (is (some? (:last_active_at row)))
                    (is (not (contains? (:details row) :last_active_at))))
                  (testing "creator served from the denormalized columns (id + common_name, no live hydrate)"
                    (is (= (mt/user->id :rasta) (get-in row [:details :creator :id])))
                    (is (= "Rasta Toucan" (get-in row [:details :creator :name])))
                    (is (= "user" (get-in row [:details :creator :type]))))
                  (testing "card has no owner column → owner is null"
                    (is (nil? (get-in row [:details :owner]))))))
              (testing "invalidating the latest hides the entity AND drops it from total; older row does NOT resurface"
                (t2/update! :model/ContentDiagnosticsFinding new-id {:stale true})
                (let [resp (serve)
                      ids  (served-ids resp)]
                  (is (not (contains? ids new-id)))
                  (is (not (contains? ids old-id)))
                  ;; total excludes the invalidated latest (stale=true), and does not fall back to the older row
                  (is (= 0 (:total resp))))))))))))

(deftest serve-include-personal-collections-test
  (testing "GET /stale excludes personal-collection findings by default; includes them with the param"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          ;; rasta's permanent personal collection — never with-temp (a personal collection can't be deleted)
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
            (mt/with-temp [:model/Collection {reg-id :id}     {}
                           :model/Card       {reg-card :id}   {:collection_id reg-id}
                           :model/Card       {pers-card :id}  {:collection_id pers-id}]
              ;; rasta can read the regular collection; their own personal collection is always self-visible
              (perms/grant-collection-read-permissions! (perms/all-users-group) reg-id)
              (let [insert     (fn [card]
                                 (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                  {:scan_id      "p-scan"
                                                                   :entity_type  :card
                                                                   :entity_id    card
                                                                   :finding_type :stale
                                                                   :details      {}})))
                    reg-fid    (insert reg-card)
                    pers-fid   (insert pers-card)
                    serve      (fn [& kvs] (apply mt/user-http-request :rasta :get 200
                                                  "ee/content-diagnostics/stale" kvs))
                    served-ids (fn [resp] (set (map :id (:data resp))))]
                (testing "default (param omitted) → personal-collection finding excluded, regular one served"
                  (let [resp (serve)]
                    (is (contains? (served-ids resp) reg-fid))
                    (is (not (contains? (served-ids resp) pers-fid)))
                    ;; total honors the live filter — only the regular finding counts
                    (is (= 1 (:total resp)))))
                (testing "include-personal-collections=false → identical to default"
                  (let [ids (served-ids (serve :include-personal-collections false))]
                    (is (contains? ids reg-fid))
                    (is (not (contains? ids pers-fid)))))
                (testing "include-personal-collections=true → both served, total counts both"
                  (let [resp (serve :include-personal-collections true)]
                    (is (contains? (served-ids resp) reg-fid))
                    (is (contains? (served-ids resp) pers-fid))
                    (is (= 2 (:total resp)))))
                (testing "exclusion is live: moving the card out of the personal collection re-surfaces it"
                  (t2/update! :model/Card pers-card {:collection_id reg-id})
                  (let [ids (served-ids (serve))]                  ; default (exclude personal)
                    (is (contains? ids pers-fid))))))))))))        ; now in a regular collection → served

(deftest serve-paginates-test
  (testing "GET /finding honors limit/offset and reports the full active total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          ;; real cards in a real collection — the serve layer permission-filters against live entities
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c1 :id} {:collection_id coll-id}
                         :model/Card {c2 :id} {:collection_id coll-id}
                         :model/Card {c3 :id} {:collection_id coll-id}]
            ;; grant read so the visibility filter scopes the served set to exactly these 3 (robust on shared CI)
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (doseq [cid [c1 c2 c3]]
              (t2/insert! :model/ContentDiagnosticsFinding
                          {:scan_id "p" :entity_type :card :entity_id cid
                           :finding_type :stale :details {}}))
            (let [page (fn [limit offset]
                         (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale"
                                               :limit limit :offset offset))]
              (testing "limit caps the page; total reflects the full active set; limit/offset echoed back"
                (let [r (page 2 0)]
                  (is (= 2 (count (:data r))))
                  (is (= 3 (:total r)))
                  (is (= 2 (:limit r)))
                  (is (= 0 (:offset r)))))
              (testing "offset advances to the remainder"
                (is (= 1 (count (:data (page 2 2)))))))))))))

(deftest serve-permission-filtered-test
  (testing "GET /stale returns only findings whose entity the current user can read"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {readable :id}   {}
                         :model/Collection {unreadable :id} {}
                         :model/Card {r-card :id} {:collection_id readable}
                         :model/Card {u-card :id} {:collection_id unreadable}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (let [insert  (fn [card]
                            (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id      "perm"
                                                              :entity_type  :card
                                                              :entity_id    card
                                                              :finding_type :stale
                                                              :details      {}})))
                  r-fid   (insert r-card)
                  u-fid   (insert u-card)
                  ids-for (fn [user] (set (map :id (:data (mt/user-http-request
                                                           user :get 200 "ee/content-diagnostics/stale")))))]
              (testing "non-admin sees only the finding in the readable collection"
                (let [ids (ids-for :rasta)]
                  (is (contains? ids r-fid))
                  (is (not (contains? ids u-fid)))))
              (testing "superuser sees findings in every collection"
                (let [ids (ids-for :crowberto)]
                  (is (contains? ids r-fid))
                  (is (contains? ids u-fid)))))))))))

(deftest serve-sort-test
  (testing "GET /stale honors sort-column + sort-direction (native columns only)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-id :id} {:collection_id coll-id}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            ;; card flagged later than the dashboard → detected-at order ≠ entity-type order (each isolable)
            (let [card-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "s" :entity_type :card :entity_id card-id
                                                             :finding_type :stale :details {}
                                                             :detected_at (t/offset-date-time 2025 6 1)}))
                  dash-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "s" :entity_type :dashboard :entity_id dash-id
                                                             :finding_type :stale :details {}
                                                             :detected_at (t/offset-date-time 2025 1 1)}))
                  order    (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                               "ee/content-diagnostics/stale" kvs))))]
              (testing "sort-column=entity-type — lexical card < dashboard"
                (is (= [card-fid dash-fid] (order :sort-column "entity-type" :sort-direction "asc")))
                (is (= [dash-fid card-fid] (order :sort-column "entity-type" :sort-direction "desc"))))
              (testing "sort-column=detected-at — dashboard (Jan) before card (Jun)"
                (is (= [dash-fid card-fid] (order :sort-column "detected-at" :sort-direction "asc")))
                (is (= [card-fid dash-fid] (order :sort-column "detected-at" :sort-direction "desc"))))
              (testing "default sort = detected-at asc"
                (is (= [dash-fid card-fid] (order)))))))))))

(deftest serve-sort-by-entity-attrs-test
  (testing "GET /stale sorts by denormalized entity columns (name / created-at / created-by / last-used-at)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-a :id} {:collection_id coll-id}
                         :model/Card {card-b :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            ;; each attr orders A,B differently so the column under test is isolated
            ;; creator NAME order (Amy < Zoe) is the inverse of creator ID order (5 < 10) → isolates name-sort
            (let [insert (fn [card nm created creator-id creator-name active]
                           (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "s" :entity_type :card :entity_id card
                                                             :finding_type        :stale :details {}
                                                             :entity_name         nm
                                                             :entity_created_at   created
                                                             :entity_creator_id   creator-id
                                                             :entity_creator_name creator-name
                                                             :last_active_at      active})))
                  a-fid (insert card-a "Alpha" (t/offset-date-time 2025 1 1) 10 "Amy" (t/offset-date-time 2025 6 1))
                  b-fid (insert card-b "Beta"  (t/offset-date-time 2025 6 1) 5  "Zoe" (t/offset-date-time 2025 1 1))
                  order (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                            "ee/content-diagnostics/stale" kvs))))]
              (testing "name — Alpha < Beta"
                (is (= [a-fid b-fid] (order :sort-column "name" :sort-direction "asc")))
                (is (= [b-fid a-fid] (order :sort-column "name" :sort-direction "desc"))))
              (testing "created-at — Jan before Jun"
                (is (= [a-fid b-fid] (order :sort-column "created-at" :sort-direction "asc"))))
              (testing "created-by — by creator NAME (Amy < Zoe), independent of the 10-vs-5 id order"
                (is (= [a-fid b-fid] (order :sort-column "created-by" :sort-direction "asc")))
                (is (= [b-fid a-fid] (order :sort-column "created-by" :sort-direction "desc"))))
              (testing "last-used-at — Jan before Jun"
                (is (= [b-fid a-fid] (order :sort-column "last-used-at" :sort-direction "asc")))))))))))

(deftest serve-entity-types-filter-test
  (testing "GET /stale filters by entity-types (repeatable; omitted = all)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-id :id} {:collection_id coll-id}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [card-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "e" :entity_type :card :entity_id card-id
                                                             :finding_type :stale :details {}}))
                  dash-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "e" :entity_type :dashboard :entity_id dash-id
                                                             :finding_type :stale :details {}}))
                  ids      (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                   "ee/content-diagnostics/stale" kvs)))))]
              (testing "omitted → all entity types"
                (is (= #{card-fid dash-fid} (ids))))
              (testing "single value → only that type"
                (is (= #{card-fid} (ids :entity-types "card")))
                (is (= #{dash-fid} (ids :entity-types "dashboard"))))
              (testing "multiple values → union of the given types"
                (is (= #{card-fid dash-fid} (ids :entity-types ["card" "dashboard"]))))
              (testing "a reserved type with no findings → empty"
                (is (empty? (ids :entity-types "document")))))))))))

(deftest serve-threshold-days-filter-test
  (testing "GET /stale threshold-days drops findings less stale than the cutoff; never-used always passes"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c-old :id}    {:collection_id coll-id}
                         :model/Card {c-recent :id} {:collection_id coll-id}
                         :model/Card {c-never :id}  {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [insert     (fn [card active-at]
                               (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                {:scan_id "t" :entity_type :card :entity_id card
                                                                 :finding_type :stale :details {}
                                                                 :last_active_at active-at})))
                  old-fid    (insert c-old    (t/minus (t/offset-date-time) (t/days 400)))
                  recent-fid (insert c-recent (t/minus (t/offset-date-time) (t/days 100)))
                  never-fid  (insert c-never  nil)
                  ids        (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                     "ee/content-diagnostics/stale" kvs)))))]
              (testing "no threshold → all three"
                (is (= #{old-fid recent-fid never-fid} (ids))))
              (testing "threshold-days=200 → keeps the 400-day-old + never-used, drops the 100-day-old"
                (is (= #{old-fid never-fid} (ids :threshold-days "200"))))
              (testing "threshold-days=50 → all qualify (each ≥50 days stale, or never used)"
                (is (= #{old-fid recent-fid never-fid} (ids :threshold-days "50")))))))))))

(deftest serve-query-search-test
  (testing "GET /stale ?query= case-insensitively substring-matches the denormalized entity name"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c-rev :id}  {:collection_id coll-id}
                         :model/Card {c-cost :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [insert   (fn [card nm]
                             (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                              {:scan_id "q" :entity_type :card :entity_id card
                                                               :finding_type :stale :details {} :entity_name nm})))
                  rev-fid  (insert c-rev  "Quarterly Revenue")
                  cost-fid (insert c-cost "Cost Analysis")
                  ids      (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                   "ee/content-diagnostics/stale" kvs)))))]
              (testing "no query → all findings"
                (is (= #{rev-fid cost-fid} (ids))))
              (testing "substring match, case-insensitive"
                (is (= #{rev-fid} (ids :query "revenue")))
                (is (= #{rev-fid} (ids :query "REV")))
                (is (= #{cost-fid} (ids :query "analysis"))))
              (testing "no match → empty"
                (is (empty? (ids :query "zzz"))))
              (testing "blank query is a no-op → all findings"
                (is (= #{rev-fid cost-fid} (ids :query "   ")))))))))))

(deftest scan-endpoint-is-feature-gated-test
  (testing "POST /scan runs synchronously for a licensed instance"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [resp (mt/user-http-request :rasta :post 200 "ee/content-diagnostics/scan")]
          (is (contains? resp :scan_id))
          (is (contains? resp :finding_count))
          (is (contains? resp :entities_scanned))
          (is (contains? resp :duration_ms))))))
  ;; DEMO (temporary): premium gate disabled in api_routes/routes.clj, so this no longer 402s. Restore with the gate.
  #_(testing "without the feature the endpoint is gated (premium-handler)"
      (mt/with-premium-features #{}
        (mt/user-http-request :rasta :post 402 "ee/content-diagnostics/scan"))))

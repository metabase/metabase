(ns metabase-enterprise.content-diagnostics.scan-test
  "The scan pipeline runs the instance-wide `stale` checker, persists a snapshot, and supersedes
  prior findings; the `GET /stale` API lists the latest valid finding per entity, live
  permission-filtered and batch-hydrated."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase-enterprise.content-diagnostics.task.scan :as task.scan]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- stale-instant
  "Comfortably past the staleness threshold, whatever its default — derived from the setting so a
  default change can't silently desync the fixture."
  []
  (t/minus (t/offset-date-time) (t/days (+ (cd.settings/content-diagnostics-stale-threshold-days) 30))))

(defn- fresh-instant []
  (t/offset-date-time))

(defn- scope-prefix
  "Unique per-test entity-name prefix, passed as `:query` so assertions only see rows the test
  seeded - the findings table is shared, so an unscoped list read can see sibling tests' rows."
  []
  (str "cd-" (mt/random-name)))

(defn- finding-for
  [rows entity-type entity-id]
  (m/find-first #(and (= entity-type (:entity_type %)) (= entity-id (:entity_id %))) rows))

(deftest scan-detects-stale-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     ;; stale: last activity well past the threshold
                     :model/Card      {stale-card-1 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Card      {stale-card-2 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Card      {stale-card-3 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Dashboard {stale-dash-1 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     :model/Dashboard {stale-dash-2 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     :model/Document  {stale-doc :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     ;; never-used arms: document never viewed (view_count 0; last_viewed_at is
                     ;; creation-stamped) / transform never ran — each + created before the cutoff
                     :model/Document  {never-viewed-doc :id} {:collection_id coll-id :created_at (stale-instant)}
                     ;; transforms live in the :transforms collection namespace, not regular collections —
                     ;; irrelevant to the instance-wide scan, so no collection at all
                     :model/Transform {never-ran-transform :id} {:created_at (stale-instant)}
                     ;; fresh: used just now (or, for the never-run transform, created just now) — must NOT be flagged
                     :model/Card      {fresh-card :id} {:collection_id coll-id :last_used_at (fresh-instant)}
                     :model/Dashboard {fresh-dash :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}
                     :model/Document  {fresh-doc :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}
                     :model/Transform {fresh-transform :id} {}]
        (scan/scan!)
        (let [stale-keys #{[:card stale-card-1] [:card stale-card-2] [:card stale-card-3]
                           [:dashboard stale-dash-1] [:dashboard stale-dash-2]
                           [:document stale-doc] [:document never-viewed-doc]
                           [:transform never-ran-transform]}
              fresh-keys #{[:card fresh-card] [:dashboard fresh-dash]
                           [:document fresh-doc] [:transform fresh-transform]}
              ;; recover this run's scan_id from a guaranteed-flagged temp entity — pins that the
              ;; persisted rows (not just scan!'s returned topline) carry the batch's scan_id
              scan-id    (t2/select-one-fn :scan_id :model/ContentDiagnosticsFinding
                                           :entity_type :card :entity_id stale-card-1
                                           :finding_type :stale)
              ;; :stale rows only - the same batch also carries the other checkers' findings (e.g. the
              ;; dashcardless fresh dashboard is legitimately imbalanced-empty)
              rows       (t2/select :model/ContentDiagnosticsFinding :scan_id scan-id :finding_type :stale)
              found-keys (set (map (juxt :entity_type :entity_id) rows))]
          (testing "the run persisted one scan_id batch of findings"
            (is (string? scan-id))
            (is (seq rows))
            ;; a different entity type flagged in the same run shares the scan_id — one unified batch
            (is (= scan-id (t2/select-one-fn :scan_id :model/ContentDiagnosticsFinding
                                             :entity_type :dashboard :entity_id stale-dash-1))))
          (testing "every stale temp entity produced a :stale finding; no fresh one did"
            (is (every? found-keys stale-keys))
            (is (empty? (set/intersection found-keys fresh-keys))))
          (testing "persisted findings carry finding_type + scope_collection_id + last_active_at + details"
            (let [row (finding-for rows :card stale-card-1)]
              (is (=? {:finding_type        :stale
                       ;; scope_collection_id is stamped at scan time from the entity's collection
                       :scope_collection_id coll-id
                       ;; threshold derived from the setting, not a literal — a default change must not desync
                       :details             {:threshold_days (cd.settings/content-diagnostics-stale-threshold-days)}
                       ;; last_active_at frozen from the card's last_used_at (top-level column, not in details)
                       :last_active_at      some?}
                      row))
              ;; details holds ONLY the threshold
              (is (= #{:threshold_days} (set (keys (:details row)))))))
          (testing "dashboard finding freezes last_active_at from last_viewed_at (per-entity-type alias)"
            (let [row (finding-for rows :dashboard stale-dash-1)]
              (is (some? (:last_active_at row)))))
          (testing "never-used document (never viewed, created before the cutoff) lands with nil last_active_at"
            (let [row (finding-for rows :document never-viewed-doc)]
              (is (some? row))
              (is (nil? (:last_active_at row)))))
          (testing "never-ran transform (created before the cutoff) lands with nil last_active_at"
            (let [row (finding-for rows :transform never-ran-transform)]
              (is (some? row))
              (is (nil? (:last_active_at row)))))
          (testing "denormalized columns (entity_name/created_at/creator_id/creator_name) are stamped at scan time"
            (let [row (finding-for rows :card stale-card-1)]
              (is (=? {:entity_name         some?
                       :entity_created_at   some?
                       :entity_creator_id   some?
                       :entity_creator_name some?}
                      row)))))))))

(deftest scan-soft-invalidates-superseded-findings-test
  (testing "a fresh scan supersedes prior findings it no longer produces — via soft invalidation, not delete"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card {resolved :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card {still :id}    {:collection_id coll-id :last_used_at (stale-instant)}]
          (scan/scan!)                                            ; scan 1: both stale
          (t2/update! :model/Card resolved {:last_used_at (fresh-instant)})  ; resolved is now fresh
          (scan/scan!)                                            ; scan 2: only `still` is stale
          (let [active (set (map :entity_id (t2/select :model/ContentDiagnosticsFinding
                                                       :entity_type :card
                                                       :entity_id [:in [resolved still]]
                                                       :invalidated_at nil)))]
            (testing "the re-flagged card stays active; the resolved one does not"
              (is (contains? active still))
              (is (not (contains? active resolved))))
            (testing "the resolved card's prior finding is soft-invalidated (kept + timestamped), not deleted"
              (let [rows (t2/select :model/ContentDiagnosticsFinding :entity_type :card :entity_id resolved)]
                (is (seq rows))                                     ; not hard-deleted — history retained
                (is (every? :invalidated_at rows))))))))))

(deftest scan-job-gated-on-premium-feature-test
  (let [scans (atom 0)]
    (mt/with-dynamic-fn-redefs [scan/scan! (fn [] (swap! scans inc))]
      (testing "the scheduled job body no-ops without the :content-diagnostics feature"
        (mt/with-premium-features #{}
          (#'task.scan/scan-when-enabled!)
          (is (zero? @scans))))
      (testing "the scheduled job body scans when the feature is present"
        (mt/with-premium-features #{:content-diagnostics}
          (#'task.scan/scan-when-enabled!)
          (is (= 1 @scans)))))))

(deftest api-latest-per-entity-and-hydration-test
  (testing "GET /stale returns the latest valid finding per entity, batch-hydrated"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-id :id} {:collection_id coll-id
                                                    :name          "Quarterly Revenue"
                                                    :creator_id    (mt/user->id :rasta)}]
            ;; rasta reads this collection → the visibility filter scopes `total` to this card's findings
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix     (scope-prefix)
                  card-name  (str prefix " Quarterly Revenue")
                  insert     (fn [scan threshold]
                               (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                {:scan_id             scan
                                                                 :entity_type         :card
                                                                 :entity_id           card-id
                                                                 :finding_type        :stale
                                                                 :last_active_at      (t/offset-date-time 2025 9 1)
                                                                 :entity_name         card-name
                                                                 :entity_creator_id   (mt/user->id :rasta)
                                                                 :entity_creator_name "Rasta Toucan"
                                                                 :details             {:threshold_days threshold}})))
                  old-id     (insert "scan-old" 30)
                  new-id     (insert "scan-new" 90)
                  fetch      #(mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale"
                                                    :query prefix)
                  fetched-ids (fn [resp] (set (map :id (:data resp))))]
              ;; membership assertions (robust to other rows / pagination), not absolute page counts
              (testing "the latest finding is returned, the superseded older one is not - and `total` counts only the latest"
                (let [resp (fetch)
                      ids  (fetched-ids resp)]
                  (is (contains? ids new-id))
                  (is (not (contains? ids old-id)))
                  ;; total must exclude the older row even though it is stale=false: it isn't MAX(id) for the entity
                  (is (= 1 (:total resp)))))
              (testing "the returned finding has flat identity + a nested typed details (collection, description, owner, creator)"
                (let [row (first (filter #(= new-id (:id %)) (:data (fetch))))]
                  (testing "entity_display_name read from the denormalized entity_name"
                    (is (= card-name (:entity_display_name row))))
                  (testing "collection breadcrumb still live-hydrated (not denormalized)"
                    (is (= coll-id (get-in row [:details :collection :id]))))
                  (testing "threshold_days stays in details; last_active_at is hoisted to a top-level property"
                    (is (= 90 (get-in row [:details :threshold_days])))
                    (is (some? (:last_active_at row)))
                    (is (not (contains? (:details row) :last_active_at))))
                  (testing "creator read from the denormalized columns (id + common_name, no live hydrate)"
                    (is (=? {:id   (mt/user->id :rasta)
                             :name "Rasta Toucan"
                             :type "user"}
                            (get-in row [:details :creator]))))
                  (testing "card has no owner column → owner is null"
                    (is (nil? (get-in row [:details :owner]))))))
              (testing "invalidating the latest hides the entity AND drops it from total; older row does NOT resurface"
                (t2/update! :model/ContentDiagnosticsFinding new-id {:invalidated_at (t/offset-date-time)})
                (let [resp (fetch)
                      ids  (fetched-ids resp)]
                  (is (not (contains? ids new-id)))
                  (is (not (contains? ids old-id)))
                  ;; total excludes the invalidated latest, and does not fall back to the older row
                  (is (= 0 (:total resp))))))))))))

(deftest api-include-personal-collections-test
  (testing "GET /stale excludes personal-collection findings by default; includes them with the param"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          ;; rasta's permanent personal collection - never with-temp (a personal collection can't be deleted)
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
            (mt/with-temp [:model/Collection {reg-id :id}     {}
                           :model/Card       {reg-card :id}   {:collection_id reg-id}
                           :model/Card       {pers-card :id}  {:collection_id pers-id}]
              ;; rasta can read the regular collection; their own personal collection is always self-visible
              (perms/grant-collection-read-permissions! (perms/all-users-group) reg-id)
              (let [prefix     (scope-prefix)
                    insert     (fn [card]
                                 (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                  {:scan_id      "p-scan"
                                                                   :entity_type  :card
                                                                   :entity_id    card
                                                                   :entity_name  (str prefix "-" card)
                                                                   :finding_type :stale
                                                                   :details      {}})))
                    reg-fid    (insert reg-card)
                    pers-fid   (insert pers-card)
                    fetch      (fn [& kvs] (apply mt/user-http-request :rasta :get 200
                                                  "ee/content-diagnostics/stale" :query prefix kvs))
                    fetched-ids (fn [resp] (set (map :id (:data resp))))]
                (testing "default (param omitted) → personal-collection finding excluded, regular one returned"
                  (let [resp (fetch)]
                    (is (contains? (fetched-ids resp) reg-fid))
                    (is (not (contains? (fetched-ids resp) pers-fid)))
                    ;; total honors the live filter - only the regular finding counts
                    (is (= 1 (:total resp)))))
                (testing "include-personal-collections=false → identical to default"
                  (let [ids (fetched-ids (fetch :include-personal-collections false))]
                    (is (contains? ids reg-fid))
                    (is (not (contains? ids pers-fid)))))
                (testing "include-personal-collections=true → both returned, total counts both"
                  (let [resp (fetch :include-personal-collections true)]
                    (is (contains? (fetched-ids resp) reg-fid))
                    (is (contains? (fetched-ids resp) pers-fid))
                    (is (= 2 (:total resp)))))
                (testing "exclusion is live: moving the card out of the personal collection re-surfaces it"
                  (t2/update! :model/Card pers-card {:collection_id reg-id})
                  (let [ids (fetched-ids (fetch))]                  ; default (exclude personal)
                    (is (contains? ids pers-fid))))))))))))        ; now in a regular collection → returned

(deftest api-paginates-test
  (testing "GET /stale honors limit/offset and reports the full valid total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          ;; real cards in a real collection - the read layer permission-filters against live entities
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c1 :id} {:collection_id coll-id}
                         :model/Card {c2 :id} {:collection_id coll-id}
                         :model/Card {c3 :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix (scope-prefix)]
              (doseq [cid [c1 c2 c3]]
                (t2/insert! :model/ContentDiagnosticsFinding
                            {:scan_id "p" :entity_type :card :entity_id cid
                             :entity_name (str prefix "-" cid)
                             :finding_type :stale :details {}}))
              (let [page (fn [limit offset]
                           (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale"
                                                 :query prefix :limit limit :offset offset))]
                (testing "limit caps the page; total reflects the full valid set; limit/offset echoed back"
                  (let [r (page 2 0)]
                    (is (= 2 (count (:data r))))
                    (is (= 3 (:total r)))
                    (is (= 2 (:limit r)))
                    (is (= 0 (:offset r)))))
                (testing "offset advances to the remainder"
                  (is (= 1 (count (:data (page 2 2))))))))))))))

(deftest api-permission-filtered-test
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

(deftest api-sort-test
  (testing "GET /stale honors sort-column + sort-direction (native columns only)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-id :id} {:collection_id coll-id}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            ;; card flagged later than the dashboard → detected-at order ≠ entity-type order (each isolable)
            (let [prefix   (scope-prefix)
                  card-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "s" :entity_type :card :entity_id card-id
                                                             :entity_name (str prefix "-" card-id)
                                                             :finding_type :stale :details {}
                                                             :detected_at (t/offset-date-time 2025 6 1)}))
                  dash-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "s" :entity_type :dashboard :entity_id dash-id
                                                             :entity_name (str prefix "-" dash-id)
                                                             :finding_type :stale :details {}
                                                             :detected_at (t/offset-date-time 2025 1 1)}))
                  order    (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                               "ee/content-diagnostics/stale"
                                                               :query prefix kvs))))]
              (testing "sort-column=entity-type - lexical card < dashboard"
                (is (= [card-fid dash-fid] (order :sort-column "entity-type" :sort-direction "asc")))
                (is (= [dash-fid card-fid] (order :sort-column "entity-type" :sort-direction "desc"))))
              (testing "sort-column=detected-at - dashboard (Jan) before card (Jun)"
                (is (= [dash-fid card-fid] (order :sort-column "detected-at" :sort-direction "asc")))
                (is (= [card-fid dash-fid] (order :sort-column "detected-at" :sort-direction "desc"))))
              (testing "default sort = detected-at asc"
                (is (= [dash-fid card-fid] (order)))))))))))

(deftest api-sort-by-entity-attrs-test
  (testing "GET /stale sorts by denormalized entity columns (name / created-at / created-by / last-active-at)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-a :id} {:collection_id coll-id}
                         :model/Card {card-b :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            ;; each attr orders A,B differently so the column under test is isolated
            ;; creator NAME order (Amy < Zoe) is the inverse of creator ID order (5 < 10) → isolates name-sort
            (let [prefix (scope-prefix)
                  insert (fn [row]
                           (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            (merge {:scan_id      "s"
                                                                    :entity_type  :card
                                                                    :finding_type :stale
                                                                    :details      {}}
                                                                   row))))
                  a-fid  (insert {:entity_id           card-a
                                  :entity_name         (str prefix " Alpha")
                                  :entity_created_at   (t/offset-date-time 2025 1 1)
                                  :entity_creator_id   10
                                  :entity_creator_name "Amy"
                                  :last_active_at      (t/offset-date-time 2025 6 1)})
                  b-fid  (insert {:entity_id           card-b
                                  :entity_name         (str prefix " Beta")
                                  :entity_created_at   (t/offset-date-time 2025 6 1)
                                  :entity_creator_id   5
                                  :entity_creator_name "Zoe"
                                  :last_active_at      (t/offset-date-time 2025 1 1)})
                  order  (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                             "ee/content-diagnostics/stale"
                                                             :query prefix kvs))))]
              (testing "name - Alpha < Beta"
                (is (= [a-fid b-fid] (order :sort-column "name" :sort-direction "asc")))
                (is (= [b-fid a-fid] (order :sort-column "name" :sort-direction "desc"))))
              (testing "created-at - Jan before Jun"
                (is (= [a-fid b-fid] (order :sort-column "created-at" :sort-direction "asc"))))
              (testing "created-by - by creator NAME (Amy < Zoe), independent of the 10-vs-5 id order"
                (is (= [a-fid b-fid] (order :sort-column "created-by" :sort-direction "asc")))
                (is (= [b-fid a-fid] (order :sort-column "created-by" :sort-direction "desc"))))
              (testing "last-active-at - Jan before Jun"
                (is (= [b-fid a-fid] (order :sort-column "last-active-at" :sort-direction "asc")))))))))))

(deftest api-entity-types-filter-test
  (testing "GET /stale filters by entity-types (repeatable; omitted = all)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         ;; transforms only go in the :transforms collection namespace
                         :model/Collection {tcoll-id :id} {:namespace "transforms"}
                         :model/Card {card-id :id} {:collection_id coll-id}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}
                         :model/Document {doc-id :id} {:collection_id coll-id}
                         :model/Transform {transform-id :id} {:collection_id tcoll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (perms/grant-collection-read-permissions! (perms/all-users-group) tcoll-id)
            (let [prefix        (scope-prefix)
                  insert        (fn [etype eid]
                                  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                   {:scan_id "e" :entity_type etype :entity_id eid
                                                                    :entity_name (str prefix "-" eid)
                                                                    :finding_type :stale :details {}})))
                  card-fid      (insert :card card-id)
                  dash-fid      (insert :dashboard dash-id)
                  doc-fid       (insert :document doc-id)
                  transform-fid (insert :transform transform-id)
                  ids           (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                        "ee/content-diagnostics/stale"
                                                                        :query prefix kvs)))))]
              (testing "omitted → all entity types"
                (is (= #{card-fid dash-fid doc-fid transform-fid} (ids))))
              (testing "single value → only that type"
                (is (= #{card-fid} (ids :entity-types "card")))
                (is (= #{dash-fid} (ids :entity-types "dashboard")))
                ;; also exercises document hydration (no description column → returned description: nil)
                (is (= #{doc-fid} (ids :entity-types "document")))
                (is (= #{transform-fid} (ids :entity-types "transform"))))
              (testing "multiple values → union of the given types"
                (is (= #{card-fid dash-fid} (ids :entity-types ["card" "dashboard"])))))))))))

(deftest api-transform-owner-hydration-test
  (testing "GET /stale hydrates the transform owner - a Metabase user or an external email, exclusively"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [;; transforms only go in the :transforms collection namespace
                         :model/Collection {coll-id :id} {:namespace "transforms"}
                         :model/Transform {owned-id :id}    {:collection_id coll-id
                                                             :owner_user_id (mt/user->id :rasta)}
                         :model/Transform {external-id :id} {:collection_id coll-id
                                                             :owner_email   "etl@vendor.io"}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix       (scope-prefix)
                  insert       (fn [tid]
                                 (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                  {:scan_id "o" :entity_type :transform :entity_id tid
                                                                   :entity_name (str prefix "-" tid)
                                                                   :finding_type :stale :details {}})))
                  owned-fid    (insert owned-id)
                  external-fid (insert external-id)
                  rows         (:data (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale"
                                                            :query prefix))
                  owner-for    (fn [fid] (get-in (first (filter #(= fid (:id %)) rows)) [:details :owner]))]
              (testing "owner_user_id → full user object"
                (is (=? {:id    (mt/user->id :rasta)
                         :name  "Rasta Toucan"
                         :email "rasta@metabase.com"
                         :type  "user"}
                        (owner-for owned-fid))))
              (testing "owner_email (no Metabase account) → external"
                (is (=? {:email "etl@vendor.io"
                         :type  "external"}
                        (owner-for external-fid)))))))))))

(deftest api-threshold-days-filter-test
  (testing "GET /stale threshold-days drops findings less stale than the cutoff; never-used always passes"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c-old :id}    {:collection_id coll-id}
                         :model/Card {c-recent :id} {:collection_id coll-id}
                         :model/Card {c-never :id}  {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix     (scope-prefix)
                  insert     (fn [card active-at]
                               (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                {:scan_id "t" :entity_type :card :entity_id card
                                                                 :entity_name (str prefix "-" card)
                                                                 :finding_type :stale :details {}
                                                                 :last_active_at active-at})))
                  old-fid    (insert c-old    (t/minus (t/offset-date-time) (t/days 400)))
                  recent-fid (insert c-recent (t/minus (t/offset-date-time) (t/days 100)))
                  never-fid  (insert c-never  nil)
                  ids        (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                     "ee/content-diagnostics/stale"
                                                                     :query prefix kvs)))))]
              (testing "no threshold → all three"
                (is (= #{old-fid recent-fid never-fid} (ids))))
              (testing "threshold-days=200 → keeps the 400-day-old + never-used, drops the 100-day-old"
                (is (= #{old-fid never-fid} (ids :threshold-days "200"))))
              (testing "threshold-days=50 → all qualify (each ≥50 days stale, or never used)"
                (is (= #{old-fid recent-fid never-fid} (ids :threshold-days "50")))))))))))

(deftest api-query-search-test
  (testing "GET /stale ?query= case-insensitively substring-matches the denormalized entity name"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c-rev :id}  {:collection_id coll-id}
                         :model/Card {c-cost :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix   (scope-prefix)
                  insert   (fn [card nm]
                             (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                              {:scan_id "q" :entity_type :card :entity_id card
                                                               :finding_type :stale :details {}
                                                               :entity_name (str prefix " " nm)})))
                  rev-fid  (insert c-rev  "Quarterly Revenue")
                  cost-fid (insert c-cost "Cost Analysis")
                  ids      (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                   "ee/content-diagnostics/stale" kvs)))))]
              ;; the no-query/blank cases can't be prefix-scoped (that's what they test) → membership, not
              ;; exact sets, so rows from other tests on the shared findings table can't break them
              (testing "no query → all findings"
                (is (set/subset? #{rev-fid cost-fid} (ids))))
              (testing "substring match, case-insensitive"
                (is (= #{rev-fid} (ids :query (u/upper-case-en (str prefix " quarterly rev")))))
                (is (= #{cost-fid} (ids :query (u/lower-case-en (str prefix " cost"))))))
              (testing "no match → empty"
                (is (empty? (ids :query (str prefix " zzz")))))
              (testing "blank query is a no-op → all findings"
                (is (set/subset? #{rev-fid cost-fid} (ids :query "   ")))))))))))

(deftest api-endpoint-is-feature-gated-test
  (testing "GET /stale is gated on the :content-diagnostics premium feature (premium-handler)"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "licensed → 200 with the paginated envelope"
        (mt/with-premium-features #{:content-diagnostics}
          (let [resp (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale")]
            (is (contains? resp :data))
            (is (contains? resp :total)))))
      (testing "unlicensed → 402"
        (mt/with-premium-features #{}
          (mt/user-http-request :rasta :get 402 "ee/content-diagnostics/stale"))))))

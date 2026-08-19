(ns metabase.metabot.tools.shared.content-store-test
  "Unit tests for the read-checked ContentStore wrapper.

  These tests pin two properties:

  1. **Pass-through when no user is bound** — serdes import / background tasks / REPL runs
     must keep working without an authenticated user. The wrapper short-circuits
     `api/read-check` and returns the inner store's row unchanged.

  2. **Read-checked when a user is bound** — all six methods (symmetric across import- and
     export-direction lookups) route through `api/read-check`. A user without read
     perms gets a 403; the underlying store is consulted for the existence check, and
     unknown / `nil` returns pass through cleanly so the per-model resolver can emit its
     `:unknown-…` agent error."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.test :as mt]))

(defn- record-store
  "A fake ContentStore that returns the configured row for each of its six methods."
  [{:keys [card measure-eid segment-eid card-id measure-id segment-id]}]
  (reify resolve.mp/ContentStore
    (card-by-entity-id    [_ _eid] card)
    (measure-by-entity-id [_ _eid] measure-eid)
    (segment-by-entity-id [_ _eid] segment-eid)
    (card-by-id           [_ _id]  card-id)
    (measure-by-id        [_ _id]  measure-id)
    (segment-by-id        [_ _id]  segment-id)))

;;; ============================================================
;;; Pass-through: no user bound
;;; ============================================================

(deftest pass-through-when-no-user-bound-test
  (testing "with api/*current-user-id* unbound, all six methods return the inner store's row unchanged"
    ;; Plain Clojure maps don't satisfy `mi/can-read?`, so a `read-check` call would throw.
    ;; The fact that these assertions pass proves no read-check fires.
    (let [row    {:opaque :marker}
          store  (record-store {:card row :measure-eid row :segment-eid row
                                :card-id row :measure-id row :segment-id row})
          gated  (shared.content-store/read-checked store)]
      (is (nil? api/*current-user-id*) "precondition: no user bound")
      (is (= row (resolve.mp/card-by-entity-id    gated "x")))
      (is (= row (resolve.mp/measure-by-entity-id gated "x")))
      (is (= row (resolve.mp/segment-by-entity-id gated "x")))
      (is (= row (resolve.mp/card-by-id           gated 1)))
      (is (= row (resolve.mp/measure-by-id        gated 1)))
      (is (= row (resolve.mp/segment-by-id        gated 1))))))

(deftest nil-from-inner-store-passes-through-unchanged-test
  (testing "when the inner store returns nil (unknown id), the wrapper returns nil — never throws"
    (let [empty-store (record-store {})
          gated       (shared.content-store/read-checked empty-store)]
      ;; nil result short-circuits the read-check branch in maybe-read-check, regardless of
      ;; whether a user is bound. This is critical: the per-model resolver functions
      ;; (`import-card-by-entity-id` etc.) translate `nil` into a clean `:unknown-card` /
      ;; `:unknown-measure` / `:unknown-segment` agent error, and a stray throw here would
      ;; turn that friendly diagnostic into a 500.
      (binding [api/*current-user-id* 1]
        (is (nil? (resolve.mp/card-by-entity-id    gated "x")))
        (is (nil? (resolve.mp/measure-by-entity-id gated "x")))
        (is (nil? (resolve.mp/segment-by-entity-id gated "x")))
        (is (nil? (resolve.mp/card-by-id           gated 1)))
        (is (nil? (resolve.mp/measure-by-id        gated 1)))
        (is (nil? (resolve.mp/segment-by-id        gated 1)))))))

;;; ============================================================
;;; Read-checked when a user is bound
;;; ============================================================

(deftest applies-read-check-when-user-bound-test
  (testing (str "with api/*current-user-id* bound, all six methods route the inner row through "
                "`api/read-check`. Using a row that doesn't satisfy `can-read?` proves the "
                "check fires on each branch — we stub `api/read-check` to a recording fn so "
                "we don't need a real auth setup, and assert it was called with the row.")
    (let [calls (atom [])
          row   {:opaque :marker}
          store (record-store {:card row :measure-eid row :segment-eid row
                               :card-id row :measure-id row :segment-id row})
          gated (shared.content-store/read-checked store)]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [obj] (swap! calls conj obj) obj)]
        (binding [api/*current-user-id* 1]
          (testing "card-by-entity-id"
            (is (= row (resolve.mp/card-by-entity-id gated "x")))
            (is (= row (last @calls))))
          (testing "measure-by-entity-id"
            (is (= row (resolve.mp/measure-by-entity-id gated "x")))
            (is (= row (last @calls))))
          (testing "segment-by-entity-id"
            (is (= row (resolve.mp/segment-by-entity-id gated "x")))
            (is (= row (last @calls))))
          (testing "card-by-id"
            (is (= row (resolve.mp/card-by-id gated 1)))
            (is (= row (last @calls))))
          (testing "measure-by-id"
            (is (= row (resolve.mp/measure-by-id gated 1)))
            (is (= row (last @calls))))
          (testing "segment-by-id"
            (is (= row (resolve.mp/segment-by-id gated 1)))
            (is (= row (last @calls))))
          (testing "all six methods invoke read-check exactly once"
            (is (= 6 (count @calls)))))))))

(deftest propagates-read-check-403-test
  (testing "if read-check throws (403), the wrapper propagates the exception unchanged"
    (let [row   {:opaque :marker}
          store (record-store {:card row :card-id row :measure-id row})
          gated (shared.content-store/read-checked store)]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [_]
                                                   (throw (ex-info "Forbidden" {:status-code 403})))]
        (binding [api/*current-user-id* 1]
          (testing "import-direction branch"
            (try
              (resolve.mp/card-by-entity-id gated "x")
              (is false "expected throw")
              (catch clojure.lang.ExceptionInfo e
                (is (= 403 (:status-code (ex-data e)))))))
          (testing "export-direction lookups"
            (doseq [lookup [resolve.mp/card-by-id resolve.mp/measure-by-id]]
              (try
                (lookup gated 1)
                (is false "expected throw")
                (catch clojure.lang.ExceptionInfo e
                  (is (= 403 (:status-code (ex-data e)))))))))))))

;;; ============================================================
;;; default-store integration shape
;;; ============================================================

(deftest default-store-shape-test
  (testing "default-store satisfies the ContentStore protocol"
    (is (satisfies? resolve.mp/ContentStore shared.content-store/default-store)))
  (testing "default-store returns nil for nonsense entity-ids (gated on entity-id?)"
    ;; The underlying unchecked-app-db-content-store short-circuits non-NanoID strings to
    ;; nil; the wrapper passes that through. No DB hit, no read-check invoked.
    (is (nil? (resolve.mp/card-by-entity-id    shared.content-store/default-store "not-a-nanoid")))
    (is (nil? (resolve.mp/measure-by-entity-id shared.content-store/default-store "not-a-nanoid")))
    (is (nil? (resolve.mp/segment-by-entity-id shared.content-store/default-store "not-a-nanoid")))))

;;; ============================================================
;;; Card export through the default store
;;; ============================================================

(deftest export-card-entity-id-is-permission-gated-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {collection-id :id} {}
                   :model/Card       {card-id :id, entity-id :entity_id}
                   {:collection_id collection-id
                    :database_id   (mt/id)
                    :dataset_query (lib/query (mt/metadata-provider)
                                              (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}]
      (let [resolver (resolve.mp/export-resolver
                      (lib-be/application-database-metadata-provider (mt/id))
                      shared.content-store/default-store)
            export!  #(resolve/export-fk resolver card-id 'Card)]
        (testing "a user who can read the source Card gets its entity_id"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (= entity-id (export!)))))
        (testing "a user who cannot read the source Card's collection gets a 403, not the entity_id"
          (mt/with-current-user (mt/user->id :rasta)
            (try
              (export!)
              (is false "expected throw")
              (catch clojure.lang.ExceptionInfo e
                (is (= 403 (:status-code (ex-data e))))))))))))

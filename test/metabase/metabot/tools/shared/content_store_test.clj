(ns metabase.metabot.tools.shared.content-store-test
  "Unit tests for the read-checked ContentStore wrapper.

  These tests pin three properties:

  1. **Pass-through when no user is bound**: serdes import / background tasks / REPL runs
     must keep working without an authenticated user. The wrapper short-circuits the
     permission check and returns the inner store's row unchanged.

  2. **Read-checked when a user is bound (`-by-entity-id` methods)**: the model named an
     entity_id outright, so these route through the audited [[api/read-check]], audit trail
     included.

  3. **Quietly 403'd when a user is bound (`-by-id` methods)**: a card surfaced during export
     is routine filtering, not an access attempt, so these route through an unaudited
     [[mi/can-read?]] + [[api/check-403]] instead. The `audited-by-id?` variant used for
     client-supplied queries keeps `read-check` on these methods. Either way, unknown /
     `nil` returns pass through cleanly so the per-model resolver can emit its
     `:unknown-…` agent error."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.test :as mt]
   [toucan2.protocols :as t2.protocols]))

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

(def ^:dynamic ^:private *stub-can-read?*
  "Controls the [[mi/can-read?]] answer for [[stub-row]]s below."
  true)

(defmethod mi/can-read? ::stub-model
  ([_row] *stub-can-read?*)
  ([_model _pk] *stub-can-read?*))

(defn- stub-row
  "Tag `row` so it dispatches to the [[::stub-model]] `can-read?` method above, instead of the
  real per-model permission logic; `can-read?` is a multimethod, so it can't be redefined with
  `mt/with-dynamic-fn-redefs`."
  [row]
  (with-meta row {`t2.protocols/model         (fn [_] ::stub-model)
                  `t2.protocols/dispatch-value (fn [_] ::stub-model)}))

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
  (testing "when the inner store returns nil (unknown id), the wrapper returns nil, never throws"
    (let [empty-store (record-store {})
          gated       (shared.content-store/read-checked empty-store)]
      ;; The per-model resolver functions turn `nil` into a clean `:unknown-card` /
      ;; `:unknown-measure` / `:unknown-segment` agent error, so a throw here would turn that
      ;; diagnostic into a 500.
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
  (testing "with a user bound, the `-by-entity-id` methods route the row through `api/read-check`"
    (let [calls (atom [])
          row   {:opaque :marker}
          store (record-store {:card row :measure-eid row :segment-eid row})
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
          (testing "all three entity-id methods invoke read-check exactly once"
            (is (= 3 (count @calls)))))))))

(deftest applies-check-403-when-user-bound-test
  (testing (str "with a user bound, the `-by-id` methods route the row through the unaudited "
                "`mi/can-read?` + `api/check-403` pair instead, never `api/read-check`")
    (let [row   (stub-row {:opaque :marker})
          store (record-store {:card-id row :measure-id row :segment-id row})
          gated (shared.content-store/read-checked store)]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [& _]
                                                   (is false "api/read-check ran on a -by-id lookup"))]
        (binding [api/*current-user-id* 1
                  *stub-can-read?*      true]
          (testing "card-by-id"
            (is (= row (resolve.mp/card-by-id gated 1))))
          (testing "measure-by-id"
            (is (= row (resolve.mp/measure-by-id gated 1))))
          (testing "segment-by-id"
            (is (= row (resolve.mp/segment-by-id gated 1)))))))))

(deftest audited-by-id-applies-read-check-test
  (testing (str "an `audited-by-id?` wrapper routes the `-by-id` methods through "
                "`api/read-check` too, for lookups driven by client-supplied queries")
    (let [calls (atom [])
          row   {:opaque :marker}
          store (record-store {:card-id row :measure-id row :segment-id row})
          gated (shared.content-store/read-checked store true)]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [obj] (swap! calls conj obj) obj)]
        (binding [api/*current-user-id* 1]
          (is (= row (resolve.mp/card-by-id    gated 1)))
          (is (= row (resolve.mp/measure-by-id gated 1)))
          (is (= row (resolve.mp/segment-by-id gated 1)))
          (is (= 3 (count @calls))))))))

(deftest propagates-read-check-403-test
  (testing "if read-check throws (403), the entity-id (import-direction) branch propagates the exception unchanged"
    (let [row   {:opaque :marker}
          store (record-store {:card row})
          gated (shared.content-store/read-checked store)]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [_]
                                                   (throw (ex-info "Forbidden" {:status-code 403})))]
        (binding [api/*current-user-id* 1]
          (try
            (resolve.mp/card-by-entity-id gated "x")
            (is false "expected throw")
            (catch clojure.lang.ExceptionInfo e
              (is (= 403 (:status-code (ex-data e))))))))))
  (testing "if can-read? is false, the by-id (export-direction) branch throws a 403 via check-403"
    (let [row   (stub-row {:opaque :marker})
          store (record-store {:card-id row :measure-id row :segment-id row})
          gated (shared.content-store/read-checked store)]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [& _]
                                                   (is false "api/read-check ran on a -by-id lookup"))]
        (binding [api/*current-user-id* 1
                  *stub-can-read?*      false]
          (doseq [lookup [resolve.mp/card-by-id resolve.mp/measure-by-id resolve.mp/segment-by-id]]
            (try
              (lookup gated 1)
              (is false "expected throw")
              (catch clojure.lang.ExceptionInfo e
                (is (= 403 (:status-code (ex-data e))))))))))))

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

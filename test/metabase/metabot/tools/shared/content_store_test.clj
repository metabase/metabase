(ns metabase.metabot.tools.shared.content-store-test
  "Unit tests for the read-checked ContentStore wrapper.

  These tests pin three properties:

  1. **Pass-through when no user is bound**: serdes import / background tasks / REPL runs
     must keep working without an authenticated user. The wrapper short-circuits the
     permission check and returns the inner store's row unchanged.

  2. **Every method is checked when a user is bound**: a row the user cannot read never
     reaches the caller, whichever direction it was looked up by. Unknown / `nil` returns pass
     through cleanly either way, so the per-model resolver can emit its `:unknown-…` agent
     error.

  3. **Only the audit trail varies**: the `-by-entity-id` methods use the audited
     [[api/read-check]], the `-by-id` methods an unaudited [[mi/can-read?]] +
     [[api/check-403]] unless `audited-by-id?` is set, and binding
     [[resolve.mp/*audit-refusals?*]] to false suppresses auditing on all six.

  4. **`repair` binds that suppression on**: the `source-card` refusals its mini-resolve passes
     catch and discard stay out of the audit trail."
  (:require
   [clojure.test :refer :all]
   [metabase.agent-lib.representations.repair :as repr.repair]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
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

(def ^:private all-lookups
  "Every `ContentStore` method, paired with an argument of the right shape."
  [[resolve.mp/card-by-entity-id    "x"]
   [resolve.mp/measure-by-entity-id "x"]
   [resolve.mp/segment-by-entity-id "x"]
   [resolve.mp/card-by-id           1]
   [resolve.mp/measure-by-id        1]
   [resolve.mp/segment-by-id        1]])

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

(deftest suppressing-the-audit-trail-still-checks-every-method-test
  (testing (str "with `*audit-refusals?*` bound off, every method (including the audited "
                "`-by-entity-id` ones and an `audited-by-id?` store) still admits a readable "
                "row and still 403s an unreadable one, without going through `api/read-check`")
    (let [row (stub-row {:opaque :marker})]
      (doseq [audited-by-id? [false true]]
        (let [store (record-store {:card row :measure-eid row :segment-eid row
                                   :card-id row :measure-id row :segment-id row})
              gated (shared.content-store/read-checked store audited-by-id?)]
          (mt/with-dynamic-fn-redefs [api/read-check (fn [& _]
                                                       (is false "api/read-check ran with auditing suppressed"))]
            (binding [api/*current-user-id*            1
                      resolve.mp/*audit-refusals?*     false]
              (doseq [[lookup arg] all-lookups]
                (binding [*stub-can-read?* true]
                  (is (= row (lookup gated arg))))
                (binding [*stub-can-read?* false]
                  (try
                    (lookup gated arg)
                    (is false "expected throw")
                    (catch clojure.lang.ExceptionInfo e
                      (is (= 403 (:status-code (ex-data e)))))))))))))))

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
;;; Suppression at the repair call site
;;; ============================================================

(def ^:private source-card-entity-id
  "A syntactically valid entity_id, so the resolver reaches the store instead of short-circuiting."
  "GRLHTBIcE5nGFVJoxGr5D")

(deftest repair-does-not-audit-the-refusals-it-swallows-test
  (testing "repair resolves a source-card ref through the store, and 403s there leave no audit trail"
    (let [lookups (atom 0)
          row     (stub-row {:id 1 :database_id 1 :entity_id source-card-entity-id})
          store   (reify resolve.mp/ContentStore
                    (card-by-entity-id    [_ _eid] (swap! lookups inc) row)
                    (measure-by-entity-id [_ _eid] nil)
                    (segment-by-entity-id [_ _eid] nil)
                    (card-by-id           [_ _id]  nil)
                    (measure-by-id        [_ _id]  nil)
                    (segment-by-id        [_ _id]  nil))
          mp      (lib.tu/mock-metadata-provider {:database {:id 1 :name "Sample"}})
          query   {"lib/type" "mbql/query"
                   "database" "Sample"
                   "stages"   [{"lib/type"    "mbql.stage/mbql"
                                "source-card" source-card-entity-id}]}]
      (mt/with-dynamic-fn-redefs [api/read-check (fn [& _]
                                                   (is false "api/read-check ran on a refusal repair discards"))]
        (binding [api/*current-user-id* 1
                  *stub-can-read?*      false]
          (let [repaired (repr.repair/repair mp query (shared.content-store/read-checked store))]
            (is (pos? @lookups) "precondition: repair looked the source card up")
            (is (= source-card-entity-id (get-in repaired ["stages" 0 "source-card"]))
                "the refused lookup is skipped, not fatal")))))))

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

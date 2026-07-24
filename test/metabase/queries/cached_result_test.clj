(ns metabase.queries.cached-result-test
  "Direct unit coverage for the read-side gate on `stored_result` blobs
  ([[metabase.queries.cached-result]]). The three lens dimensions are covered end-to-end through
  `GET /api/exploration/query/:id` in `metabase-enterprise.sandbox.explorations-test`, and the
  thread-granularity rollup in `metabase.explorations.derived-perms-test`. What neither reaches is
  the gate's own degenerate input — a missing `dataset_query`, a perms/lens check that throws — nor
  which `:reason` a denial carries. Those are pinned here, against the namespace's own vars, so the
  gate stays guarded if explorations ever stops being its only caller (`stored_result` is already
  cross-feature: documents' static `cardEmbed` nodes reference `stored_result_id`).

  These are pure: every branch exercised below either short-circuits before touching the app DB or
  has its DB-backed collaborator redefined. The redefs are thread-safe ones — the perms vars they
  replace are shared with every other test in the run."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.queries.cached-result :as cached-result]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]))

(set! *warn-on-reflection* true)

(def ^:private a-query
  "Any `dataset_query` — the column is NOT NULL, so the gate is entitled to one. Every test that uses
  it redefines the collaborators that would read it, so its contents never matter."
  {:database 1 :type :query :query {:source-table 1}})

(def ^:private a-sandbox-token
  {:sandbox {1 [1 "2026-01-01" {"price" "1"}]}})

(def ^:private a-different-sandbox-token
  {:sandbox {1 [2 "2026-01-01" {"price" "2"}]}})

(defn- denial!
  "`ex-data` of the 403 [[cached-result/assert-can-view-cached-result!]] throws for `stored-result`,
  or nil when the viewer is allowed to stream it."
  [stored-result]
  (try
    (cached-result/assert-can-view-cached-result! stored-result)
    nil
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(deftest missing-dataset-query-throws-test
  (testing "`stored_result.dataset_query` is NOT NULL, so a gate caller handing over a map without it
            (a trimmed-row bug) is a caller bug, not a viewer to adjudicate. It must fail loudly
            rather than fall back to a quiet verdict that could be either too strict or too lax"
    (doseq [superuser? [true false]]
      (binding [api/*is-superuser?* superuser?]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"stored-result is missing its dataset_query"
                              (cached-result/viewer-can-view-cached-result?
                               {:id 1 :database_id 1 :data_access_token {}}))
            (str "superuser? " superuser?))))))

(deftest nil-token-is-admin-only-test
  (testing "a pre-token snapshot (or a write that failed to capture one) can't be compared against
            any viewer lens. The fallback is admin-only: a superuser is never sandboxed or
            impersonated and resolves to the router db itself, so serving them cannot leak"
    (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (constantly true)]
      (let [sr {:id 1 :database_id 1 :data_access_token nil :dataset_query a-query}]
        (binding [api/*is-superuser?* true]
          (is (true? (cached-result/viewer-can-view-cached-result? sr))))
        (binding [api/*is-superuser?* false]
          (is (false? (cached-result/viewer-can-view-cached-result? sr)))
          (is (= :incompatible-context (:reason (denial! sr)))))))))

(deftest lens-computation-throwing-is-admin-only-test
  (testing "the viewer's lens is uncomputable when they are missing a routing/impersonation attribute
            the snapshot's database requires, or when the query's source-card chain no longer
            resolves to tables (deleted card). Either throw lands on the same admin-only fallback as
            a nil token — never a 500 out of an authorization gate"
    (let [assert-admin-only!
          (fn []
            (let [sr {:id 1 :database_id 1 :data_access_token a-sandbox-token :dataset_query a-query}]
              (binding [api/*is-superuser?* true]
                (is (true? (cached-result/viewer-can-view-cached-result? sr))))
              (binding [api/*is-superuser?* false]
                (is (false? (cached-result/viewer-can-view-cached-result? sr)))
                (is (= {:status-code 403 :reason :incompatible-context :stored-result-id 1}
                       (denial! sr))))))]
      ;; both throw sites are exercised: each redef below shadows the working one installed outside.
      (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (constantly true)
                                              query-perms/query->resolved-source-table-ids (constantly #{1})
                                              perms/data-access-token (constantly a-sandbox-token)]
        (testing "resolving the query's source tables throws (deleted source card)"
          (dynamic-redefs/with-dynamic-fn-redefs [query-perms/query->resolved-source-table-ids
                                                  (fn [_] (throw (ex-info "Card 7 does not exist." {})))]
            (assert-admin-only!)))
        (testing "computing the viewer's token throws (missing routing/impersonation attribute)"
          (dynamic-redefs/with-dynamic-fn-redefs [perms/data-access-token
                                                  (fn [_] (throw (ex-info "Required user attribute is missing" {})))]
            (assert-admin-only!)))))))

(deftest data-perms-check-throwing-is-admin-only-test
  (testing "the data-perms dimension must fail the same controlled way the lens dimension does. A
            throw out of the perms check — a stored query malformed enough to trip its schema, an NPE
            from a source table that no longer exists — is not an exception to escape an
            authorization gate (`can-run-query?` itself only absorbs `ExceptionInfo`); it falls back
            to admin-only, sound because a superuser holds every data perm unconditionally"
    (doseq [thrown [(NullPointerException. "boom")
                    (ex-info "malformed query" {})]]
      (testing (str "threw " (class thrown))
        (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (fn [_] (throw thrown))
                                                query-perms/query->resolved-source-table-ids (constantly #{1})
                                                perms/data-access-token (constantly a-sandbox-token)]
          (let [sr {:id 1 :database_id 1 :data_access_token a-sandbox-token :dataset_query a-query}]
            (binding [api/*is-superuser?* true]
              (is (true? (cached-result/viewer-can-view-cached-result? sr))))
            (binding [api/*is-superuser?* false]
              (is (false? (cached-result/viewer-can-view-cached-result? sr)))
              (is (= :no-data-perms (:reason (denial! sr)))))))))))

(deftest denial-reasons-are-distinct-test
  (testing "the two denial reasons are reported distinctly, so they can't be collapsed into one
            message by a refactor: the caller and the i18n string both key off `:reason`"
    (binding [api/*is-superuser?* false]
      (testing "lacking data perms on the underlying query"
        (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (constantly false)]
          (is (= {:status-code 403 :reason :no-data-perms :stored-result-id 7}
                 (denial! {:id 7 :database_id 1 :data_access_token a-sandbox-token
                           :dataset_query a-query})))))
      (testing "holding the perms but under an incompatible lens"
        (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (constantly true)
                                                query-perms/query->resolved-source-table-ids (constantly #{1})
                                                perms/data-access-token (constantly a-different-sandbox-token)]
          (is (= {:status-code 403 :reason :incompatible-context :stored-result-id 7}
                 (denial! {:id 7 :database_id 1 :data_access_token a-sandbox-token
                           :dataset_query a-query}))))))))

(deftest data-perms-are-checked-before-the-lens-test
  (testing "reason priority is part of the contract: a viewer who fails both checks is told they lack
            data perms rather than being handed the lens-mismatch message, which would imply the data
            is theirs to see under a different lens"
    (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (constantly false)
                                            query-perms/query->resolved-source-table-ids (constantly #{1})
                                            perms/data-access-token (constantly a-different-sandbox-token)]
      (binding [api/*is-superuser?* false]
        (is (= :no-data-perms
               (:reason (denial! {:id 1 :database_id 1 :data_access_token a-sandbox-token
                                  :dataset_query a-query}))))))))

(deftest compatible-viewer-is-allowed-test
  (testing "control: perms held and lenses matching means the blob streams — the gate must not be
            trivially satisfiable by denying everything"
    (dynamic-redefs/with-dynamic-fn-redefs [query-perms/can-run-query? (constantly true)
                                            query-perms/query->resolved-source-table-ids (constantly #{1})
                                            perms/data-access-token (constantly a-sandbox-token)]
      (binding [api/*is-superuser?* false]
        (let [sr {:id 1 :database_id 1 :data_access_token a-sandbox-token :dataset_query a-query}]
          (is (true? (cached-result/viewer-can-view-cached-result? sr)))
          (is (nil? (denial! sr))))))))

(deftest unknown-reason-still-throws-403-test
  (testing "adding a reason to `cached-result-blocked-reason` without extending the message `case`
            must not turn a 403 into a 500 out of an authorization gate — the fallthrough is a
            generic denial"
    (dynamic-redefs/with-dynamic-fn-redefs [cached-result/cached-result-blocked-reason (constantly :some-future-reason)]
      (is (= {:status-code 403 :reason :some-future-reason :stored-result-id 1}
             (denial! {:id 1 :database_id 1 :data_access_token {} :dataset_query a-query}))))))

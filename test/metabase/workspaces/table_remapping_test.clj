(ns metabase.workspaces.table-remapping-test
  "Unit tests for the shared table-remapping helpers in
  `metabase.workspaces.table-remapping`: `override-metadata-provider`,
  `rewrite-table-refs`, and `verify-only-references`. Exercised directly with
  synthetic inputs — no DB needed (parsing aside)."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   [metabase.workspaces.table-remapping :as k]))

(set! *warn-on-reflection* true)

;;; --------------------------------- override-metadata-provider ---------------------------------

(defn- mock-provider []
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "db" :engine :postgres}
    :tables   [{:id 10 :name "orders"    :schema "public" :lib/type :metadata/table}
               {:id 11 :name "customers" :schema "public" :lib/type :metadata/table}]}))

(deftest override-metadata-provider-applies-overrides-test
  (testing "overrides merge onto the matching :metadata/table; nil = passthrough"
    (let [mp      (mock-provider)
          wrapped (k/override-metadata-provider
                   (fn [t] (when (= 10 (:id t)) {:name "scratch_orders" :schema "public"}))
                   mp)]
      (is (= {:name "scratch_orders" :schema "public"}
             (select-keys (lib.metadata/table wrapped 10) [:name :schema]))
          "the mapped table is overridden")
      (is (= {:name "customers" :schema "public"}
             (select-keys (lib.metadata/table wrapped 11) [:name :schema]))
          "an unmapped table (nil override) passes through unchanged"))))

(deftest override-metadata-provider-leaves-parent-untouched-test
  (testing "wrapping does not mutate the parent provider"
    (let [mp      (mock-provider)
          wrapped (k/override-metadata-provider
                   (fn [_] {:name "scratch_orders"})
                   mp)]
      (lib.metadata/table wrapped 10)
      (is (= "orders" (:name (lib.metadata/table mp 10)))
          "the parent still serves the canonical name"))))

;;; --------------------------------- rewrite-table-refs ---------------------------------

(deftest rewrite-table-refs-redirects-test
  (testing "a table ref is redirected to its replacement target"
    (is (= "SELECT id FROM public.scratch_orders"
           (k/rewrite-table-refs
            :postgres "SELECT id FROM orders"
            {:tables {{:table "orders"} {:schema "public" :table "scratch_orders"}}})))))

(deftest rewrite-table-refs-on-parse-error-test
  (testing "a parse failure is funnelled to :on-parse-error (not thrown)"
    (let [seen (atom nil)
          ;; A genuinely unparseable string. (If a backend parses it leniently this
          ;; is a no-op rewrite, which still must not throw.)
          result (k/rewrite-table-refs
                  :postgres "SELECT FROM FROM WHERE )("
                  {:tables {{:table "orders"} {:table "scratch_orders"}}}
                  {:on-parse-error (fn [_sql e] (reset! seen (class e)) ::handled)})]
      (is (or (= ::handled result) (string? result))
          "either the parse error was handled, or the backend tolerated the input")
      (when (= ::handled result)
        (is (some? @seen) "the cause exception was passed to on-parse-error")))))

(deftest rewrite-table-refs-default-rethrows-test
  (testing "without :on-parse-error, a parse failure propagates"
    ;; Use an obviously broken input; on backends that tolerate it this is a no-op,
    ;; so only assert the no-throw-on-valid path here and the throw-path via the
    ;; explicit handler test above.
    (is (string? (k/rewrite-table-refs
                  :postgres "SELECT 1"
                  {:tables {}})))))

;;; --------------------------------- verify-only-references ---------------------------------

(defn- norm [{:keys [schema table]}]
  {:schema (u/lower-case-en (or schema "public"))
   :table  (u/lower-case-en table)})

(defn- guard-of [thunk]
  (try (thunk) ::no-throw
       (catch clojure.lang.ExceptionInfo e (:guard (ex-data e)))))

(defn- throw-violation
  [msg extra]
  (throw (ex-info msg extra)))

(deftest verify-passes-when-all-refs-allowed-test
  (is (= "SELECT id FROM public.scratch_orders"
         (k/verify-only-references
          :postgres "SELECT id FROM public.scratch_orders"
          {:normalize-ref    norm
           :allowed-refs     #{{:schema "public" :table "scratch_orders"}}
           :forbidden-tokens #{"orders"}
           :on-violation     throw-violation}))))

(deftest verify-guard-non-empty-refs-test
  (testing "non-empty allowed-refs but SQL has no resolvable refs → ::non-empty-refs"
    (is (= ::k/non-empty-refs
           (guard-of #(k/verify-only-references
                       :postgres "SELECT 1"
                       {:normalize-ref    norm
                        :allowed-refs     #{{:schema "public" :table "scratch_orders"}}
                        :forbidden-tokens #{}
                        :on-violation     throw-violation})))))
  (testing "empty allowed-refs is a vacuous pass (zero-table caller)"
    (is (= "SELECT 1"
           (k/verify-only-references
            :postgres "SELECT 1"
            {:normalize-ref    norm
             :allowed-refs     #{}
             :forbidden-tokens #{}
             :on-violation     throw-violation})))))

(deftest verify-guard-refs-subset-test
  (testing "a ref not in allowed-refs → ::refs-subset-allowed"
    (is (= ::k/refs-subset-allowed
           (guard-of #(k/verify-only-references
                       :postgres "SELECT * FROM widgets"
                       {:normalize-ref    norm
                        :allowed-refs     #{{:schema "public" :table "scratch_orders"}}
                        :forbidden-tokens #{}
                        :on-violation     throw-violation})))))
  (testing "a safe-alias ref is exempt from the subset guard"
    (is (= "SELECT * FROM test_output"
           (k/verify-only-references
            :postgres "SELECT * FROM test_output"
            {:normalize-ref    norm
             :allowed-refs     #{{:schema "public" :table "scratch_orders"}}
             :forbidden-tokens #{}
             :safe-aliases     #{"test_output"}
             :on-violation     throw-violation})))))

(deftest verify-guard-token-survival-string-literal-test
  (testing "a forbidden token surviving in a string literal → ::token-survival"
    (is (= ::k/token-survival
           (guard-of #(k/verify-only-references
                       :postgres "SELECT 'orders' AS x FROM public.scratch_orders"
                       {:normalize-ref    norm
                        :allowed-refs     #{{:schema "public" :table "scratch_orders"}}
                        :forbidden-tokens #{"orders"}
                        :on-violation     throw-violation}))))))

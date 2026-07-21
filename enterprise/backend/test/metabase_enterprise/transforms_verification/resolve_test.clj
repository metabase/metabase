(ns ^:mb/driver-tests metabase-enterprise.transforms-verification.resolve-test
  "Tests for metabase-enterprise.transforms-verification.resolve.

  `rewrite-native-sql` and the four-guard `verify` only parse, so they are tested
  directly with no DB (:postgres as a fixed dialect). `resolve-test-transform`
  end-to-end (compile + rewrite/override + verify) needs a real metadata
  provider, so those tests are driver-gated with `mt/dataset test-data`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase-enterprise.transforms-verification.resolve :as resolve]
   [metabase-enterprise.transforms-verification.test-util :as tu]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Helpers
;;; ---------------------------------------------------------------------------

(def ^:private orders->scratch
  "A one-entry scratch mapping: public.orders -> public.scratch_orders (same schema)."
  {{:schema "public" :table "orders"} {:schema "public" :table "scratch_orders"}})

(def ^:private orders+customers->scratch
  {{:schema "public" :table "orders"}    {:schema "public" :table "scratch_orders"}
   {:schema "public" :table "customers"} {:schema "public" :table "scratch_customers"}})

(defn- rewrite
  "Rewrite native SQL through the current parser backend."
  [sql mapping]
  (resolve/rewrite-native-sql :postgres sql mapping (sql-tools.settings/current-parser-backend)))

(defn- rewrite+verify
  "Rewrite then verify; returns the verified SQL (throws on guard failure)."
  [sql mapping]
  (let [rw (rewrite sql mapping)]
    (resolve/verify :postgres mapping rw)))

(defn- cannot-test-run?
  "True when `thunk` throws the typed ::cannot-test-run error; optionally asserts
  the firing guard."
  ([thunk] (cannot-test-run? thunk nil))
  ([thunk expected-guard]
   (try
     (thunk)
     false
     (catch clojure.lang.ExceptionInfo e
       (let [{:keys [error-type guard]} (ex-data e)]
         (and (= ::errors/cannot-test-run error-type)
              (or (nil? expected-guard) (= expected-guard guard))))))))

;;; ===========================================================================
;;; Rewrite-correct catalogue (cases 1-8): assert rewritten shape + verify passes
;;; ===========================================================================

(deftest case-1-unqualified-table-unqualified-columns-test
  (testing "case 1: unqualified table ref + unqualified columns"
    ;; The rewritten ref is qualified with the target scratch schema (public) and
    ;; driver-quoted, so the reference is case-preserved and matches the created table.
    ;; (Assert the load-bearing fragment, not the full string — the surrounding
    ;; formatting is backend pretty-printing and churns on parser version bumps.)
    (is (re-find #"FROM \"public\"\.\"scratch_orders\""
                 (rewrite "SELECT id FROM orders" orders->scratch)))
    (is (string? (rewrite+verify "SELECT id FROM orders" orders->scratch)))))

(deftest case-2-schema-qualified-table-alias-qualified-columns-test
  (testing "case 2: schema-qualified table ref, alias-qualified columns"
    ;; sqlglot emits `AS o`; macaw emits bare `o` — accept both.
    (let [rw (rewrite "SELECT o.id, o.total FROM public.orders o" orders->scratch)]
      (is (re-find #"FROM \"public\"\.\"scratch_orders\"\s+(AS\s+)?o" rw)
          "scratch ref is schema-qualified, quoted, and keeps the alias")
      (is (string? (resolve/verify :postgres orders->scratch rw))))))

(deftest case-3-self-join-test
  (testing "case 3: self-join (two aliases, same table)"
    ;; sqlglot emits `AS a`; macaw emits bare `a` — accept both.
    (let [rw (rewrite "SELECT a.id FROM orders a JOIN orders b ON a.id = b.id" orders->scratch)]
      (is (re-find #"\"scratch_orders\"\s+(AS\s+)?a" rw))
      (is (re-find #"\"scratch_orders\"\s+(AS\s+)?b" rw))
      (is (string? (resolve/verify :postgres orders->scratch rw))))))

(deftest case-4-subquery-test
  (testing "case 4: subquery (table inside derived table)"
    (let [rw (rewrite "SELECT * FROM (SELECT * FROM orders) sub" orders->scratch)]
      (is (re-find #"FROM \"public\".\"scratch_orders\"" rw))
      (is (string? (resolve/verify :postgres orders->scratch rw))))))

(deftest case-5-cte-real-ref-non-shadowing-test
  (testing "case 5: CTE with a real-table ref inside, non-shadowing CTE name"
    (let [rw (rewrite "WITH recent AS (SELECT * FROM orders WHERE id > 1) SELECT * FROM recent"
                      orders->scratch)]
      (is (re-find #"FROM \"public\".\"scratch_orders\"" rw))
      ;; verify: referenced-tables-raw excludes the CTE name `recent`, so only scratch_orders remains
      (is (string? (resolve/verify :postgres orders->scratch rw))))))

(deftest case-6-join-using-both-mapped-test
  (testing "case 6: JOIN ... USING (both tables mapped)"
    (let [rw (rewrite "SELECT * FROM orders JOIN customers USING (cust_id)" orders+customers->scratch)]
      (is (re-find #"scratch_orders" rw))
      (is (re-find #"scratch_customers" rw))
      (is (string? (resolve/verify :postgres orders+customers->scratch rw))))))

(deftest case-7-comments-preserved-test
  (testing "case 7: comments (line) preserved through rewrite"
    (let [rw (rewrite "SELECT id FROM orders -- a comment\nWHERE id > 1" orders->scratch)]
      (is (re-find #"scratch_orders" rw))
      (is (string? (resolve/verify :postgres orders->scratch rw))))))

(deftest case-8-quoted-exact-case-identifier-test
  (let [mapping {{:schema "public" :table "Orders"} {:schema "public" :table "scratch_Orders"}}]
    (testing "case 8 (sqlglot): quoted exact-case identifier with exact-case replacement key"
      ;; A quoted mixed-case table mapped by exact case; output stays quoted.
      (sql-tools/with-parser-backend :sqlglot
        (let [rw (rewrite "SELECT id FROM \"public\".\"Orders\"" mapping)]
          (is (re-find #"\"scratch_Orders\"" rw))
          ;; verify: scratch ref set folds to lowercase; referenced-tables-raw returns the
          ;; case-preserved name (Orders -> scratch_Orders); normalize-ref driver-normalizes
          ;; (strips quoting) then lowercases both sides.
          (is (string? (resolve/verify :postgres mapping rw))))))
    (testing "case 8 (macaw): a quoted original + pre-quoted target double-quotes — fails closed"
      ;; mapping->replacements pre-quotes targets (sqlglot preserves case that way);
      ;; macaw quotes again when the original ref was quoted, yielding `\"\"...\"\"` —
      ;; unparseable, so refs come back empty and guard 1 rejects it. Fail-closed, not
      ;; silent: a known macaw divergence, pinned here so a behavior change surfaces.
      (sql-tools/with-parser-backend :macaw
        (let [rw (rewrite "SELECT id FROM \"public\".\"Orders\"" mapping)]
          (is (cannot-test-run? #(resolve/verify :postgres mapping rw)
                                ::resolve/non-empty-refs)))))))

;;; ===========================================================================
;;; Must-fail catalogue (cases 9-13)
;;; ===========================================================================

(deftest case-9-malformed-sql-typed-error-test
  (testing "case 9: malformed SQL -> typed ::cannot-test-run via the rewrite guard"
    (is (cannot-test-run?
         #(rewrite "SELECT * FORM orders WHEREX" orders->scratch)
         ::resolve/rewrite))))

(deftest case-10-unmapped-table-survives-in-from-test
  (testing "case 10: a referenced table with no scratch mapping survives in FROM (guard 2)"
    ;; orders is mapped, widgets is not -> widgets passes through replace-names untouched
    ;; and survives in FROM -> guard 2 (refs not subset of scratch) fires.
    (is (cannot-test-run?
         #(rewrite+verify "SELECT * FROM orders JOIN widgets ON orders.id = widgets.oid"
                          orders->scratch)
         ::resolve/refs-subset-scratch))))

(deftest case-11-dangling-qualifier-caught-by-guard-3-not-guard-2-test
  (testing "case 11: MBQL-style fully-qualified SQL with a dangling schema.table.column
            qualifier is caught by guard 3 (token-survival), not guard 2 (refs subset)"
    ;; Construct the broken rewrite directly: FROM points at scratch, but a column
    ;; qualifier still names the real `orders` table (the FROM-only-rewrite hazard).
    ;; referenced-tables-raw reports only FROM/JOIN sources -> [scratch_orders] -> guard 2 passes;
    ;; guard 3 must catch the surviving `orders` token.
    (let [broken "SELECT \"public\".\"orders\".\"user_id\" FROM \"public\".\"scratch_orders\""]
      ;; sanity: guard 2 alone would pass (the only FROM source is scratch_orders).
      ;; Raw parser output keeps quoting on macaw and strips it on sqlglot — assert
      ;; the substance, not the quoting.
      (let [refs (vec (sql-tools/referenced-tables-raw :postgres broken))]
        (is (= 1 (count refs)))
        (is (re-find #"scratch_orders" (:table (first refs)))))
      ;; but verify as a whole fails closed via guard 3
      (is (cannot-test-run?
           #(resolve/verify :postgres orders->scratch broken)
           ::resolve/token-survival)))))

(deftest case-12-cte-shadow-test
  (testing "case 12: CTE whose name shadows a mapped real table, no real reference"
    ;; `WITH orders AS (...) SELECT * FROM orders` — the only `orders` is the CTE.
    ;; On sqlglot, replace-names mis-rewrites the final CTE-ref to scratch_orders,
    ;; silently changing what the query reads; guard 4's CTE-name scan catches the
    ;; surviving `WITH orders AS (` definition. On macaw the rewrite leaves the CTE
    ;; alone, so refs = [] against a non-empty mapping and guard 1 fires. Either
    ;; way it must fail closed with the typed error.
    (let [rw (rewrite "WITH orders AS (SELECT 1 AS id) SELECT * FROM orders" orders->scratch)]
      (is (cannot-test-run? #(resolve/verify :postgres orders->scratch rw))))))

(deftest guard-4-shadowing-cte-case-insensitive-test
  (testing "a shadowing CTE that differs only in case from a mapped real table is caught (guard 4)"
    ;; On case-folding drivers `Orders` == `orders`, so `WITH Orders AS (...)` can
    ;; redirect a reference the user meant for the CTE onto scratch_orders. Guard 4
    ;; must match the CTE name case-insensitively (consistent with guard 3's
    ;; lowercased comparison). Feed verify the SQL directly so the CTE survives verbatim.
    (doseq [cte-name ["Orders" "ORDERS"]]
      (let [sql (str "WITH " cte-name " AS (SELECT 1 AS id) SELECT * FROM scratch_orders")]
        (is (cannot-test-run?
             #(resolve/verify :postgres orders->scratch sql)
             ::resolve/token-survival)
            (str "CTE named " cte-name " must trip guard 4"))))))

(deftest guard-3-parse-failure-fails-closed-test
  (testing "guard 3 fails closed (like guards 1/2) when field-references throws"
    ;; A field-references parse failure must not silently pass guard 3 by swallowing
    ;; the throw to an empty error set (fail-open). Force the throw; referenced-tables-raw
    ;; still succeeds so guards 1/2 pass and guard 3 is the one exercised.
    (with-redefs [sql-tools/field-references (fn [& _] (throw (ex-info "boom" {})))]
      (is (cannot-test-run?
           #(resolve/verify :postgres orders->scratch "SELECT id FROM scratch_orders")
           ::resolve/token-survival)))))

(deftest case-13-empty-refs-vacuous-pass-blocked-test
  (testing "case 13: empty refs (parse error -> []) must fail guard 1, not pass vacuously"
    ;; referenced-tables-raw returns [] on a parse error. Feed verify a string that
    ;; parses to zero table refs; guard 1 must fire.
    (is (cannot-test-run?
         #(resolve/verify :postgres orders->scratch "SELECT 1")
         ::resolve/non-empty-refs))
    ;; A genuinely malformed string yields [] or throws from referenced-tables-raw —
    ;; either way guard 1 (::non-empty-refs).
    (is (cannot-test-run?
         #(resolve/verify :postgres orders->scratch "NOT SQL AT ALL ;;;")
         ::resolve/non-empty-refs))))

;;; ===========================================================================
;;; Backend-divergence (cases 14-15)
;;; ===========================================================================

(deftest case-14-unused-key-tolerated-on-both-backends-test
  (testing "case 14: an unused replacement key never throws (allow-unused? is passed)"
    ;; mapping references `customers` but the SQL only uses `orders`. sqlglot ignores
    ;; unused keys unconditionally; macaw errors on them unless :allow-unused? — which
    ;; rewrite-native-sql always passes (there is always an unused bare/qualified
    ;; twin key). Assert on both backends.
    (doseq [backend [:sqlglot :macaw]]
      (sql-tools/with-parser-backend backend
        (let [rw (rewrite "SELECT id FROM orders" orders+customers->scratch)]
          (is (re-find #"scratch_orders" rw) (str "backend " backend))
          (is (not (re-find #"scratch_customers" rw)) (str "backend " backend)))))))

;;; ===========================================================================
;;; Ambiguous bare table names: same table name in two schemas
;;; ===========================================================================

(deftest ambiguous-bare-table-name-fails-closed-test
  (testing "same-named tables in two non-default schemas: an unqualified ref must not
            silently redirect to an arbitrary scratch table — it fails closed"
    (let [mapping {{:schema "sales" :table "orders"}   {:schema "public" :table "scratch_sales_orders"}
                   {:schema "archive" :table "orders"} {:schema "public" :table "scratch_archive_orders"}}]
      (is (cannot-test-run? #(rewrite+verify "SELECT * FROM orders" mapping)))
      ;; schema-qualified refs still rewrite to their own targets
      (is (re-find #"scratch_sales_orders"
                   (rewrite "SELECT * FROM sales.orders" mapping)))
      (is (re-find #"scratch_archive_orders"
                   (rewrite "SELECT * FROM archive.orders" mapping))))))

(deftest ambiguous-bare-table-name-default-schema-resolves-test
  (testing "when exactly one of the same-named tables is in the driver default schema,
            an unqualified ref resolves there (mirrors warehouse search-path resolution)"
    (let [mapping {{:schema "public" :table "orders"}  {:schema "public" :table "scratch_public_orders"}
                   {:schema "archive" :table "orders"} {:schema "public" :table "scratch_archive_orders"}}
          rw      (rewrite "SELECT * FROM orders" mapping)]
      (is (re-find #"scratch_public_orders" rw))
      (is (not (re-find #"scratch_archive_orders" rw)))
      (is (string? (resolve/verify :postgres mapping rw))))))

(deftest case-15-table-only-key-matches-loosely-on-sqlglot-test
  (testing "case 15: a bare table key matches a schema-qualified ref on sqlglot (loose match)"
    ;; sqlglot-specific divergence (macaw does not loose-match a bare key against a
    ;; qualified ref) — pin the backend so the assertion holds under a :macaw sweep.
    (sql-tools/with-parser-backend :sqlglot
      (let [bare-only {{:table "orders"} {:schema "public" :table "scratch_orders"}}]
        (is (re-find #"FROM \"public\"\.\"scratch_orders\""
                     (rewrite "SELECT id FROM public.orders" bare-only)))))))

;;; ===========================================================================
;;; Token-survival edge: a mapped table whose name is a substring of a surviving
;;; column identifier must pass (orders mapped away, orders_total column remains).
;;; ===========================================================================

(deftest token-survival-substring-column-passes-test
  (testing "a legitimate column `orders_total` does not trip the token-survival guard when `orders` is mapped away"
    ;; Bare columns are identifiers, outside the CTE-scoped token scan. Must pass.
    (let [sql "SELECT orders_total FROM scratch_orders"]
      (is (string? (resolve/verify :postgres orders->scratch sql))))))

(deftest token-survival-orders-old-does-not-match-orders-test
  (testing "`scratch_orders_old` in FROM is not flagged as a surviving `orders`"
    ;; Plain identifiers are outside the CTE-scoped token scan, so nothing
    ;; here is scanned for `orders`. (orders_old is mapped too — unmapped it would
    ;; trip guard 2 and mask the substring concern.)
    (let [mapping {{:schema "public" :table "orders"}     {:schema "public" :table "scratch_orders"}
                   {:schema "public" :table "orders_old"} {:schema "public" :table "scratch_orders_old"}}
          sql     "SELECT id FROM scratch_orders JOIN scratch_orders_old ON true"]
      (is (string? (resolve/verify :postgres mapping sql))))))

(deftest token-survival-case-different-quoted-alias-passes-test
  (testing "a case-different quoted alias of a mapped table must not trip the token scan"
    ;; The lib derives join aliases from table display names, so joining `products`
    ;; compiles to `... AS "Products"` — a legitimate alias over a scratch table.
    ;; Aliases are identifiers, outside the CTE-scoped token scan; this pins
    ;; that MBQL-join-shaped SQL passes verify.
    (let [mapping {{:schema "public" :table "orders"}   {:schema "public" :table "scratch_orders"}
                   {:schema "public" :table "products"} {:schema "public" :table "scratch_products"}}
          sql     (str "SELECT \"Products\".\"id\" FROM \"public\".\"scratch_orders\" "
                       "LEFT JOIN \"public\".\"scratch_products\" AS \"Products\" "
                       "ON \"Products\".\"id\" = \"public\".\"scratch_orders\".\"product_id\"")]
      (is (string? (resolve/verify :postgres mapping sql))))))

(deftest column-named-like-mapped-table-passes-test
  (testing "a bare *column* named like another mapped input table passes verify"
    ;; Table/column name collisions are routine (`status`, `type`, `source`, `state`).
    ;; The token scan is scoped to CTE definition names, so a plain column
    ;; reference must not trip it.
    (let [mapping {{:schema "public" :table "orders"} {:schema "public" :table "scratch_orders"}
                   {:schema "public" :table "status"} {:schema "public" :table "scratch_status"}}
          sql     "SELECT status FROM public.scratch_orders JOIN public.scratch_status ON true"]
      (is (string? (resolve/verify :postgres mapping sql)))))
  (testing "a user-written *alias* equal to a mapped table name passes verify"
    (let [mapping {{:schema "public" :table "orders"} {:schema "public" :table "scratch_orders"}
                   {:schema "public" :table "people"} {:schema "public" :table "scratch_people"}}
          sql     (str "SELECT x AS people FROM public.scratch_orders"
                       " JOIN public.scratch_people ON true")]
      (is (string? (resolve/verify :postgres mapping sql))))))

(deftest safe-aliases-exempt-from-refs-guard-test
  (testing "a safe-aliases name is exempt from guard 2 (the caller CTE-binds it)"
    (is (= "SELECT * FROM test_output"
           (resolve/verify :postgres orders->scratch
                           "SELECT * FROM test_output" #{"test_output"})))))

;;; ===========================================================================
;;; Schema-less drivers (MySQL/MariaDB): a nil scratch schema must not leak into
;;; the rewritten SQL as the literal identifier "NULL"
;;; ===========================================================================

(def ^:private orders->scratch-nil-schema
  "A scratch mapping as MySQL/MariaDB produce it: real and scratch specs both
  carry :schema nil; the namespace travels in the catalog slot, which
  mapping->replacements never sees."
  {{:schema nil :table "orders"} {:schema nil :table "scratch_orders_xyz"}})

(deftest nil-schema-scratch-target-rewrites-to-bare-table-test
  (testing "a nil-schema scratch target rewrites to a bare table reference, not a
            NULL-qualified one (pinned :mysql dialect; no live connection needed)"
    (let [rw (resolve/rewrite-native-sql :mysql "SELECT id FROM orders"
                                         orders->scratch-nil-schema
                                         (sql-tools.settings/current-parser-backend))]
      (is (not (re-find #"(?i)\bnull\b" rw))
          (str "rewritten SQL must not contain a literal NULL qualifier: " (pr-str rw)))
      (is (re-find #"scratch_orders_xyz" rw)))))

(deftest nil-schema-scratch-target-passes-verify-test
  (testing "verify accepts a nil-schema scratch ref: a leaked NULL qualifier would
            parse back as :schema \"null\", mismatch the allowed set's :schema nil,
            and be rejected as stray"
    (let [rw (resolve/rewrite-native-sql :mysql "SELECT id FROM orders"
                                         orders->scratch-nil-schema
                                         (sql-tools.settings/current-parser-backend))]
      (is (string? (resolve/verify :mysql orders->scratch-nil-schema rw))))))

;;; ===========================================================================
;;; String literals are data, not references
;;; ===========================================================================

(deftest string-literal-table-name-passes-test
  (testing "a string literal containing a mapped table's name passes verify"
    ;; Literals are data; only warehouse-side dynamic SQL could turn one into a
    ;; table access, and that sits inside the native-perms trust envelope.
    (let [sql "SELECT id FROM scratch_orders WHERE src = 'orders'"]
      (is (string? (resolve/verify :postgres orders->scratch sql)))))
  (testing "dbt accepted_values shape: a value list containing a mapped table's name"
    ;; `'awaiting contact'` with a mapped `contact` table — the literal contains
    ;; the table name as a whole word, and must still verify.
    (let [mapping {{:schema "public" :table "orders"}  {:schema "public" :table "scratch_orders"}
                   {:schema "public" :table "contact"} {:schema "public" :table "scratch_contact"}}
          sql     (str "SELECT * FROM test_output"
                       " WHERE status NOT IN ('new', 'awaiting contact', 'closed')")]
      (is (string? (resolve/verify :postgres mapping sql #{"test_output"}))))))

;;; ===========================================================================
;;; Native end-to-end (gated): resolve-test-transform native path
;;; ===========================================================================

(defn- native-transform
  "Build a native-SQL transform value from a SQL string (proper MBQL 5 native query)."
  [mp sql]
  {:source {:type :query :query (lib/native-query mp sql)}})

(deftest resolve-native-happy-path-test
  (testing "resolve-test-transform native path: compile + rewrite + verify -> artifact"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              transform (native-transform mp "SELECT id FROM orders")
              mapping   {{:schema (tu/test-schema) :table "orders"}
                         {:schema (tu/test-schema) :table "scratch_orders_xyz"}}
              target    {:schema (tu/test-schema) :table "out_xyz"}
              art       (resolve/resolve-test-transform transform mapping target {:db (mt/db)})]
          (is (= driver/*driver* (:driver art)))
          (is (= (sql-tools/parser-backend) (:parser-backend art)))
          (is (= target (:target art)))
          ;; :compiled carried intact (qp.compile/compile shape), only :query updated
          (is (contains? (:compiled art) :query))
          (is (re-find #"scratch_orders_xyz" (:query (:compiled art))))
          (is (not (re-find #"\borders\b(?!_)" (:query (:compiled art))))))))))

(deftest resolve-native-table-qualified-column-fails-closed-test
  (testing "native SQL with table-qualified columns (SELECT orders.id FROM orders) fails
            closed via guard 3 — the accepted limitation"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              transform (native-transform mp "SELECT orders.id FROM orders")
              mapping   {{:schema (tu/test-schema) :table "orders"}
                         {:schema (tu/test-schema) :table "scratch_orders_xyz"}}
              target    {:schema (tu/test-schema) :table "out_xyz"}]
          ;; FROM rewrites to scratch, but `orders.id` qualifier dangles -> guard 3.
          (is (cannot-test-run?
               #(resolve/resolve-test-transform transform mapping target {:db (mt/db)})
               ::resolve/token-survival)))))))

;;; ===========================================================================
;;; MBQL end-to-end (gated): resolve-test-transform override-compile path
;;; ===========================================================================

(defn- mbql-transform [q] {:source {:type :query :query q}})

(deftest resolve-mbql-single-table-aggregation-test
  (testing "MBQL single-table aggregation compiles under the override -> only scratch refs"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              orders    (lib.metadata/table mp (mt/id :orders))
              q         (-> (lib/query mp orders) (lib/aggregate (lib/count)))
              transform (mbql-transform q)
              inputs    [{:id (mt/id :orders) :schema (tu/test-schema) :name "orders"}]
              mapping   {{:schema (tu/test-schema) :table "orders"}
                         {:schema (tu/test-schema) :table "scratch_orders_abc"}}
              target    {:schema (tu/test-schema) :table "out_abc"}
              art       (resolve/resolve-test-transform transform mapping target
                                                        {:db (mt/db) :input-tables inputs})
              sql       (:query (:compiled art))]
          (is (re-find #"scratch_orders_abc" sql))
          (is (not (re-find #"\"orders\"" sql)))
          ;; verify passed (resolve would have thrown otherwise) — assert directly too
          (is (string? (resolve/verify driver/*driver* mapping sql))))))))

(deftest resolve-mbql-two-table-join-test
  (testing "MBQL two-table join compiles to scratch refs for both physical tables"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table :left-join)
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              orders    (lib.metadata/table mp (mt/id :orders))
              products  (lib.metadata/table mp (mt/id :products))
              opid      (lib.metadata/field mp (mt/id :orders :product_id))
              pid       (lib.metadata/field mp (mt/id :products :id))
              q         (-> (lib/query mp orders)
                            (lib/join (lib/join-clause products [(lib/= opid pid)])))
              transform (mbql-transform q)
              inputs    [{:id (mt/id :orders) :schema (tu/test-schema) :name "orders"}
                         {:id (mt/id :products) :schema (tu/test-schema) :name "products"}]
              mapping   {{:schema (tu/test-schema) :table "orders"}   {:schema (tu/test-schema) :table "scratch_orders_j"}
                         {:schema (tu/test-schema) :table "products"} {:schema (tu/test-schema) :table "scratch_products_j"}}
              target    {:schema (tu/test-schema) :table "out_j"}
              art       (resolve/resolve-test-transform transform mapping target
                                                        {:db (mt/db) :input-tables inputs})
              sql       (:query (:compiled art))]
          (is (re-find #"scratch_orders_j" sql))
          (is (re-find #"scratch_products_j" sql))
          (is (not (re-find #"\"public\"\.\"orders\"" sql)))
          (is (not (re-find #"\"public\"\.\"products\"" sql))))))))

(deftest resolve-mbql-order-by-test
  (testing "MBQL with ORDER BY: every qualifier (incl. ORDER BY) points at scratch"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              orders    (lib.metadata/table mp (mt/id :orders))
              uid       (lib.metadata/field mp (mt/id :orders :user_id))
              q         (-> (lib/query mp orders)
                            (lib/aggregate (lib/count))
                            (lib/breakout uid)
                            (lib/order-by uid))
              transform (mbql-transform q)
              inputs    [{:id (mt/id :orders) :schema (tu/test-schema) :name "orders"}]
              mapping   {{:schema (tu/test-schema) :table "orders"}
                         {:schema (tu/test-schema) :table "scratch_orders_ob"}}
              target    {:schema (tu/test-schema) :table "out_ob"}
              art       (resolve/resolve-test-transform transform mapping target
                                                        {:db (mt/db) :input-tables inputs})
              sql       (:query (:compiled art))]
          (is (re-find #"ORDER BY" sql))
          (is (re-find #"scratch_orders_ob" sql))
          ;; guard 3 would have caught any dangling `orders` qualifier — assert none survives
          (is (not (re-find #"\"public\"\.\"orders\"\." sql))))))))

(deftest resolve-mbql-incomplete-mapping-fails-closed-test
  (testing "MBQL with an incomplete override map (a joined table left unmapped) fails closed
            via guards 2+3"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table :left-join)
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              orders    (lib.metadata/table mp (mt/id :orders))
              products  (lib.metadata/table mp (mt/id :products))
              opid      (lib.metadata/field mp (mt/id :orders :product_id))
              pid       (lib.metadata/field mp (mt/id :products :id))
              q         (-> (lib/query mp orders)
                            (lib/join (lib/join-clause products [(lib/= opid pid)])))
              transform (mbql-transform q)
              ;; only orders is provided in input-tables and mapping; products is left real
              inputs    [{:id (mt/id :orders) :schema (tu/test-schema) :name "orders"}]
              mapping   {{:schema (tu/test-schema) :table "orders"}
                         {:schema (tu/test-schema) :table "scratch_orders_inc"}}
              target    {:schema (tu/test-schema) :table "out_inc"}]
          ;; products survives -> guard 2 (not subset) and/or guard 3 (token survives) fires
          (is (cannot-test-run?
               #(resolve/resolve-test-transform transform mapping target
                                                {:db (mt/db) :input-tables inputs}))))))))

;;; ===========================================================================
;;; Unsupported transform type
;;; ===========================================================================

(deftest resolve-python-transform-unsupported-test
  (testing "a non-:query (python) transform throws ::unsupported-transform-type"
    (let [transform {:source {:type :python}}]
      (try
        (resolve/resolve-test-transform transform {} {:schema "public" :table "out"} {:db {:engine "postgres"}})
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= ::errors/unsupported-transform-type (:error-type (ex-data e)))))))))

;;; ===========================================================================
;;; Guard 1 must not reject zero-input transforms
;;; ===========================================================================

(deftest guard-1-passes-zero-table-transform-test
  ;; Guard 1 fires only when mapping is non-empty and refs is empty — that pattern
  ;; implies a parse failure lost references that existed. Empty mapping + empty refs
  ;; is vacuously safe: nothing to protect, and Guard 2 still catches any stray refs.
  (testing "SELECT 1 AS x with empty mapping → verify returns the SQL (not ::non-empty-refs)"
    (let [sql "SELECT 1 AS x"]
      (is (= sql (resolve/verify :postgres {} sql))
          "zero-table transform with empty mapping must pass Guard 1")))
  (testing "SELECT 1 AS x with non-empty mapping → verify throws ::non-empty-refs"
    ;; Guard 1 does fire when mapping is non-empty and refs is empty — that means the
    ;; parser lost references from a non-trivial SQL (a real safety concern).
    (is (cannot-test-run?
         #(resolve/verify :postgres orders->scratch "SELECT 1 AS x")
         ::resolve/non-empty-refs)
        "non-empty mapping + empty refs must still fire Guard 1"))
  (testing "non-empty mapping + non-empty unmapped refs → Guard 2 fires (not Guard 1)"
    ;; The complementary case: mapping non-empty but the ref isn't in the scratch set.
    ;; refs is non-empty, so Guard 1 passes and Guard 2 fires.
    (is (cannot-test-run?
         #(resolve/verify :postgres orders->scratch "SELECT * FROM widgets")
         ::resolve/refs-subset-scratch)
        "unmapped ref must still fire Guard 2")))

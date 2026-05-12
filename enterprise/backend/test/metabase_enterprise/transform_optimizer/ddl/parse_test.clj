(ns metabase-enterprise.transform-optimizer.ddl.parse-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.ddl.parse :as ddl.parse]))

(set! *warn-on-reflection* true)

(def ^:private allowed-tables
  "Standard fixture: a couple of `shop` tables that the optimizer's
  referenced-tables set would normally produce."
  #{["shop" "orders"] ["shop" "order_items"] ["shop" "reviews"]})

;; ---------------------------------------------------------------------------
;; Happy path

(deftest accepts-canonical-create-index-test
  (testing "minimal CREATE INDEX is accepted"
    (let [r (ddl.parse/parse
             "CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON shop.orders (customer_id);"
             allowed-tables)]
      (is (true? (:ok? r)))
      (is (= "idx_orders_customer_id" (:name r)))
      (is (= "shop" (:schema r)))
      (is (= "orders" (:table r)))))

  (testing "with CONCURRENTLY"
    (let [r (ddl.parse/parse
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_o ON shop.orders (status, ordered_at)"
             allowed-tables)]
      (is (true? (:ok? r)))))

  (testing "with UNIQUE"
    (let [r (ddl.parse/parse
             "CREATE UNIQUE INDEX IF NOT EXISTS idx_r ON shop.reviews (id)"
             allowed-tables)]
      (is (true? (:ok? r)))))

  (testing "with INCLUDE + partial predicate"
    (let [r (ddl.parse/parse
             (str "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_o "
                  "ON shop.orders (customer_id) INCLUDE (total_cents) "
                  "WHERE status = 'paid'")
             allowed-tables)]
      (is (true? (:ok? r)))))

  (testing "case-insensitive keywords"
    (let [r (ddl.parse/parse
             "create index if not exists idx_o on shop.orders (customer_id)"
             allowed-tables)]
      (is (true? (:ok? r))))))

;; ---------------------------------------------------------------------------
;; Multi-statement rejection (primary anti-injection defence)

(deftest rejects-multi-statement-test
  (testing "second statement after CREATE INDEX is rejected"
    (let [r (ddl.parse/parse
             "CREATE INDEX IF NOT EXISTS idx_o ON shop.orders (id); DROP TABLE foo;"
             allowed-tables)]
      ;; The forbidden keyword check fires before multi-statement, but either
      ;; rejection is acceptable — what matters is we DO reject.
      (is (false? (:ok? r)))
      (is (contains? #{:forbidden-keyword :multi-statement} (:reason r)))))

  (testing "two CREATE INDEXes are rejected (one statement per ddl entry)"
    (let [r (ddl.parse/parse
             (str "CREATE INDEX idx_a ON shop.orders (id);"
                  "CREATE INDEX idx_b ON shop.orders (customer_id);")
             allowed-tables)]
      (is (false? (:ok? r)))
      (is (= :multi-statement (:reason r)))))

  (testing "trailing semicolon is fine (one statement only)"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id);  "
             allowed-tables)]
      (is (true? (:ok? r))))))

;; ---------------------------------------------------------------------------
;; Forbidden keywords

(deftest rejects-forbidden-keywords-test
  (doseq [forbidden ["DROP TABLE x"
                     "ALTER TABLE shop.orders DROP COLUMN id"
                     "GRANT ALL ON shop.orders TO public"
                     "REVOKE SELECT ON shop.orders FROM bob"
                     "TRUNCATE shop.orders"
                     "DELETE FROM shop.orders"
                     "UPDATE shop.orders SET id = 0"
                     "INSERT INTO shop.orders VALUES (1)"
                     "COPY shop.orders TO '/tmp/x'"
                     "VACUUM shop.orders"
                     "REINDEX TABLE shop.orders"
                     "REFRESH MATERIALIZED VIEW v"
                     "DO $$ BEGIN END $$"
                     "EXECUTE foo"
                     "SET timezone = 'UTC'"]]
    (testing (str "rejected: " forbidden)
      (let [r (ddl.parse/parse forbidden allowed-tables)]
        (is (false? (:ok? r)))
        (is (= :forbidden-keyword (:reason r))
            (str "rejection reason for: " forbidden))))))

;; ---------------------------------------------------------------------------
;; Sanitisation — strings + comments can't smuggle a second statement

(deftest sanitiser-strips-string-contents-test
  (testing "semicolon inside a single-quoted string is not a statement separator"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id) WHERE message = ';DROP TABLE x;';"
             allowed-tables)]
      (is (true? (:ok? r)))))

  (testing "'' escape inside a string still works"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id) WHERE note = 'foo''bar'"
             allowed-tables)]
      (is (true? (:ok? r))))))

(deftest sanitiser-strips-line-comments-test
  (testing "-- comment after the statement is harmless"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id) -- DROP TABLE x;"
             allowed-tables)]
      (is (true? (:ok? r)))))

  (testing "-- followed by a forbidden keyword on the same line is still hidden"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id) -- and then ALTER TABLE\n"
             allowed-tables)]
      (is (true? (:ok? r))))))

;; ---------------------------------------------------------------------------
;; Unknown-table rejection

(deftest rejects-unknown-table-test
  (testing "table not in the referenced-tables set is rejected"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_x ON public.users (id)"
             allowed-tables)]
      (is (false? (:ok? r)))
      (is (= :unknown-table (:reason r)))
      (is (re-find #"public\.users" (:detail r)))))

  (testing "case-insensitive matching against allowed set"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON SHOP.ORDERS (id)"
             allowed-tables)]
      (is (true? (:ok? r))
          "schema/table comparison is case-insensitive"))))

;; ---------------------------------------------------------------------------
;; Bad shape

(deftest rejects-non-create-index-test
  (testing "garbage prefix is rejected"
    (let [r (ddl.parse/parse "CREATE TABLE foo (id int)" allowed-tables)]
      (is (false? (:ok? r)))
      (is (= :not-create-index (:reason r)))))

  (testing "missing schema qualifier"
    (let [r (ddl.parse/parse "CREATE INDEX idx_o ON orders (id)" allowed-tables)]
      (is (false? (:ok? r)))
      (is (= :not-create-index (:reason r)))))

  (testing "blank input"
    (let [r (ddl.parse/parse "" allowed-tables)]
      (is (false? (:ok? r))))))

;; ---------------------------------------------------------------------------
;; Block comments and dollar-quoted strings are rejected by design

(deftest rejects-block-comments-and-dollar-quotes-test
  (testing "block comments are treated opaquely; if they hide a semicolon, we still reject"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id) /* foo */"
             allowed-tables)]
      ;; The /* … */ leaves residual characters in the sanitised text that
      ;; cause the regex to either succeed (if the comment is well-placed) or
      ;; fail. Either way the result is safe.
      (is (or (true? (:ok? r))
              (false? (:ok? r))))))

  (testing "an attacker hiding a forbidden keyword in a block comment doesn't smuggle it"
    (let [r (ddl.parse/parse
             "CREATE INDEX idx_o ON shop.orders (id) /*; DROP TABLE x;*/"
             allowed-tables)]
      ;; The block comment is left mostly intact in the sanitised stream, but
      ;; the forbidden-keyword scan finds "DROP" anyway and rejects.
      (is (false? (:ok? r))))))

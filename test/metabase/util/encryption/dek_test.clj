(ns metabase.util.encryption.dek-test
  "Unit tests for the DEK store seam against the in-memory implementation. DB-free and parallel."
  (:require
   [clojure.test :refer :all]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption.dek :as dek]))

(set! *warn-on-reflection* true)

(def ^:private kek  (encryption/secret-key->hash "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ="))
(def ^:private kek2 (encryption/secret-key->hash "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="))

(deftest wrap-unwrap-round-trip-test
  (let [dek (dek/random-dek)]
    (is (= 32 (count dek)))
    (is (= (seq dek)
           (seq (dek/unwrap-dek kek (dek/wrap-dek kek dek)))))))

(deftest wrap-unwrap-wrong-kek-is-deterministic-failure-test
  (testing "unwrapping under the wrong KEK throws (GCM auth failure), never returns garbage"
    (let [wrapped (dek/wrap-dek kek (dek/random-dek))]
      (is (thrown? javax.crypto.AEADBadTagException
                   (dek/unwrap-dek kek2 wrapped))))))

(deftest mint-and-active-generation-test
  (let [store (dek/in-memory-store)]
    (testing "active-generation mints the first generation on an empty store"
      (let [{:keys [generation-id dek]} (dek/active-generation store kek)]
        (is (= 1 generation-id))
        (is (= 32 (count dek)))))
    (testing "minting advances the active generation"
      (let [{:keys [generation-id]} (dek/mint-generation! store kek)]
        (is (= 2 generation-id)))
      (is (= 2 (:generation-id (dek/active-generation store kek))))
      (is (= [1 2] (dek/generation-ids store))))))

(deftest fetch-by-id-spanning-generations-test
  (let [store (dek/in-memory-store)
        g1    (dek/active-generation store kek)
        g2    (dek/mint-generation! store kek)]
    (testing "each generation's DEK is retrievable by id and stable"
      (is (= (seq (:dek g1)) (seq (dek/dek-by-id store kek 1))))
      (is (= (seq (:dek g2)) (seq (dek/dek-by-id store kek 2))))
      (is (not= (seq (:dek g1)) (seq (:dek g2)))))
    (testing "an unknown generation throws"
      (is (thrown? clojure.lang.ExceptionInfo (dek/dek-by-id store kek 99))))))

(deftest rewrap-all-under-new-kek-test
  (let [store (dek/in-memory-store)
        g1    (dek/active-generation store kek)
        g2    (dek/mint-generation! store kek)]
    (dek/clear-cache!)
    (testing "after rewrap, the same DEK material unwraps under the new KEK"
      (is (= 2 (dek/rewrap-all! store kek kek2)))
      (dek/clear-cache!)
      (is (= (seq (:dek g1)) (seq (dek/dek-by-id store kek2 1))))
      (is (= (seq (:dek g2)) (seq (dek/dek-by-id store kek2 2)))))
    (testing "and no longer unwraps under the old KEK"
      (dek/clear-cache!)
      (is (thrown? javax.crypto.AEADBadTagException (dek/dek-by-id store kek 1))))))

(deftest store-override-controls-initialization-test
  (testing "with no *store* override bound, no store resolves in this test environment (legacy fallback)"
    ;; the app-DB resolver derives "is this DB encrypted?" from the current application DB's sentinel; the base test
    ;; app DB is not encrypted (and may not even be set up in this shard), so no store resolves either way
    (is (nil? (dek/store)))
    (is (false? (dek/store-initialized?))))
  (testing "binding the *store* override makes a store available regardless of the resolver"
    (binding [dek/*store* (dek/in-memory-store)]
      (is (some? (dek/store)))
      (is (true? (dek/store-initialized?)))))
  (testing "binding the *store* override to `none` forces \"no store\" regardless of the resolver"
    (binding [dek/*store* dek/none]
      (is (nil? (dek/store)))
      (is (false? (dek/store-initialized?))))))

(ns metabase.search.lease-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.lease :as lease]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defn- with-current-schema! [f]
  (mt/with-empty-h2-app-db!
    (f)))

;; These tests exercise a new table, so isolate them in an app DB migrated from the current changelog.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once with-current-schema!)

(defn- coordinate []
  {:engine "appdb", :version (str (random-uuid)), :lang-code "en"})

(defn- delete-coordinate! [{:keys [engine version lang-code]}]
  (t2/delete! :search_index_lease :engine engine :version version :lang_code lang-code))

(deftest acquire-release-and-coordinate-granularity-test
  (let [coordinate-a (coordinate)
        coordinate-b (assoc coordinate-a :engine "semantic")]
    (try
      (let [claim-a (lease/try-acquire! coordinate-a)
            claim-b (lease/try-acquire! coordinate-b)]
        (is (some? claim-a) "the first caller acquires a coordinate")
        (is (every? some? ((juxt :acquired_at :last_renewed_at :expires_at) claim-a)))
        (is (nil? (lease/try-acquire! coordinate-a)) "a live lease excludes the same coordinate")
        (is (some? claim-b) "a different engine does not contend")
        (is (false? (lease/release! (assoc claim-a :owner (str (random-uuid)))))
            "a non-owner cannot release the lease")
        (is (true? (lease/release! claim-a)))
        (is (some? (lease/try-acquire! coordinate-a)) "release makes the coordinate immediately available"))
      (finally
        (delete-coordinate! coordinate-a)
        (delete-coordinate! coordinate-b)))))

(deftest expired-lease-can-be-reclaimed-test
  (let [coordinate (coordinate)]
    (try
      (let [first-claim (lease/try-acquire! coordinate)]
        (t2/update! :search_index_lease
                    {:engine    (:engine first-claim)
                     :version   (:version first-claim)
                     :lang_code (:lang_code first-claim)}
                    {:expires_at (t/minus (t/offset-date-time) (t/minutes 1))})
        (let [replacement (lease/try-acquire! coordinate)]
          (is (some? replacement))
          (is (not= (:owner first-claim) (:owner replacement)))
          (is (false? (lease/renew! first-claim)) "the expired owner cannot renew after takeover")
          (is (false? (lease/release! first-claim)) "the expired owner cannot release the replacement")
          (is (true? (lease/release! replacement)))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest acquisition-cleans-up-unrelated-expired-leases-test
  (let [expired-coordinate (coordinate)
        new-coordinate     (coordinate)]
    (try
      (let [expired-claim (lease/try-acquire! expired-coordinate)]
        (t2/update! :search_index_lease
                    {:engine    (:engine expired-claim)
                     :version   (:version expired-claim)
                     :lang_code (:lang_code expired-claim)}
                    {:expires_at (t/minus (t/offset-date-time) (t/minutes 1))})
        (is (some? (lease/try-acquire! new-coordinate)))
        (is (nil? (t2/select-one :search_index_lease
                                 :engine (:engine expired-coordinate)
                                 :version (:version expired-coordinate)
                                 :lang_code (:lang-code expired-coordinate)))))
      (finally
        (delete-coordinate! expired-coordinate)
        (delete-coordinate! new-coordinate)))))

(deftest do-with-lease-test
  (let [coordinate (coordinate)]
    (try
      (testing "the body runs and the lease is released"
        (is (= {:acquired? true, :result :done}
               (lease/do-with-lease coordinate (constantly :done))))
        (is (nil? (t2/select-one :search_index_lease
                                 :engine (:engine coordinate)
                                 :version (:version coordinate)
                                 :lang_code (:lang-code coordinate)))))
      (testing "the body is skipped while another owner holds the lease"
        (let [claim (lease/try-acquire! coordinate)
              ran?  (atom false)]
          (is (= {:acquired? false}
                 (lease/do-with-lease coordinate #(reset! ran? true))))
          (is (false? @ran?))
          (lease/release! claim)))
      (testing "the lease is released when the body throws"
        (is (thrown-with-msg? Exception #"boom"
                              (lease/do-with-lease coordinate #(throw (Exception. "boom")))))
        (is (some? (lease/try-acquire! coordinate))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest renew-test
  (let [coordinate (coordinate)]
    (try
      (let [claim (lease/try-acquire! coordinate)]
        (is (true? (lease/renew! claim)))
        (is (false? (lease/renew! (assoc claim :owner (str (random-uuid)))))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest acquisition-commits-independently-of-caller-transaction-test
  (let [coordinate (coordinate)
        claim      (atom nil)]
    (try
      (is (thrown-with-msg? Exception #"roll back caller"
                            (t2/with-transaction [_conn]
                              (reset! claim (lease/try-acquire! coordinate))
                              (throw (Exception. "roll back caller")))))
      (is (= (:owner @claim)
             (t2/select-one-fn :owner :search_index_lease
                               :engine (:engine coordinate)
                               :version (:version coordinate)
                               :lang_code (:lang-code coordinate)))
          "the lease is visible even though the caller's ambient transaction rolled back")
      (finally
        (delete-coordinate! coordinate)))))

(deftest lease-holds-locale-stable-test
  (let [coordinate (assoc (coordinate) :lang-code "en")]
    (try
      (binding [i18n/*site-locale-override* "de"]
        (is (= {:acquired? true, :result "en"}
               (lease/do-with-lease coordinate i18n/site-locale-string))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest obsolete-locale-coordinate-is-fenced-test
  (let [wrong-locale (if (= "zz" (i18n/site-locale-string)) "yy" "zz")
        coordinate   (assoc (coordinate) :lang-code wrong-locale)]
    (try
      (is (thrown-with-msg?
           Exception
           #"coordinate became obsolete"
           (lease/do-with-lease coordinate lease/assert-coordinate-current!)))
      (finally
        (delete-coordinate! coordinate)))))

(deftest stale-owner-is-fenced-test
  (let [coordinate (coordinate)]
    (try
      (let [claim   (lease/try-acquire! coordinate)
            context {:claim claim, :lost? (atom false)}]
        (t2/update! :search_index_lease
                    {:engine    (:engine claim)
                     :version   (:version claim)
                     :lang_code (:lang_code claim)}
                    {:owner (str (random-uuid))})
        (let [error (try
                      (binding [lease/*lease-context* context]
                        (lease/assert-current!))
                      nil
                      (catch Exception e e))]
          (is (= ::lease/lease-lost (:type (ex-data error))))
          (is (true? @(:lost? context)))
          (is (thrown? Exception
                       (binding [lease/*lease-context* context]
                         (lease/throw-if-lost!))))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest stale-owner-cannot-activate-pending-index-test
  (let [version    (str (random-uuid))
        index-name (str (random-uuid))
        coordinate {:engine "appdb", :version version, :lang-code (i18n/site-locale-string)}]
    (try
      (is (true? (search-index-metadata/create-pending! :appdb version index-name)))
      (is (thrown-with-msg?
           Exception
           #"lease was lost"
           (lease/do-with-lease
            coordinate
            (fn []
              (let [{:keys [engine version lang_code]} (:claim lease/*lease-context*)]
                (t2/update! :search_index_lease
                            {:engine engine, :version version, :lang_code lang_code}
                            {:owner (str (random-uuid))}))
              (search-index-metadata/active-pending!
               :appdb version lease/assert-current-in-transaction!)))))
      (is (= :pending
             (t2/select-one-fn :status :model/SearchIndexMetadata
                               :engine :appdb :version version :index_name index-name))
          "the ownership check and metadata rotation share a transaction")
      (finally
        (t2/delete! :model/SearchIndexMetadata :engine :appdb :version version)
        (delete-coordinate! coordinate)))))

(deftest concurrent-acquisition-elects-one-owner-test
  (let [coordinate (coordinate)
        ready      (CountDownLatch. 2)
        start      (CountDownLatch. 1)
        contend    (fn []
                     (.countDown ready)
                     (.await start)
                     (lease/try-acquire! coordinate))
        contenders [(future (contend)) (future (contend))]]
    (try
      (is (.await ready 5 TimeUnit/SECONDS))
      (.countDown start)
      (let [claims (mapv deref contenders)]
        (is (= 1 (count (filter some? claims))))
        (lease/release! (first (filter some? claims))))
      (finally
        (.countDown start)
        (run! future-cancel contenders)
        (delete-coordinate! coordinate)))))

(deftest initialization-and-reindex-use-the-same-lease-coordinate-test
  (let [coordinates (atom [])
        operations  (atom [])]
    (with-redefs [search.engine/active-engines (constantly [:search.engine/appdb])
                  search.engine/log-resolution! (constantly nil)
                  search.engine/init! (fn [_engine _opts]
                                        (swap! operations conj :init)
                                        {:card 1})
                  search.engine/reindex! (fn [_engine _opts]
                                           (swap! operations conj :reindex)
                                           {:card 1})
                  lease/do-with-lease (fn [coordinate thunk]
                                        (swap! coordinates conj coordinate)
                                        {:acquired? true, :result (thunk)})]
      (search/init-index!)
      @(search/reindex! {:async? false})
      (is (= [:init :reindex] @operations))
      (is (= 2 (count @coordinates)))
      (is (apply = @coordinates)))))

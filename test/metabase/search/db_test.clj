(ns metabase.search.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.search.db :as search.db]
   [metabase.test.fixtures :as fixtures]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private injection
  "A value that is valid SQL on its own. Bound as a parameter it matches nothing; compiled into the
  statement it would change the query."
  "x' OR '1'='1")

(deftest ^:parallel index-metadata-lookups-bind-their-values-test
  (testing "a value that looks like SQL is matched literally rather than compiled into the statement"
    (is (nil? (search.db/active-index-name :appdb injection injection)))
    (is (nil? (search.db/active-index-created-at injection injection)))
    (is (false? (search.db/pending-index-metadata-exists? :appdb injection injection)))
    (is (= [] (search.db/index-metadata :appdb injection injection)))
    (is (false? (search.db/table-exists? injection)))))

(deftest index-metadata-writes-bind-their-values-test
  (t2/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
    (let [engine  :something-futureproof
          version (str (random-uuid))
          index-1 (str (random-uuid))]
      (search.db/insert-index-metadata! {:engine     engine
                                         :version    version
                                         :lang_code  "en"
                                         :index_name index-1
                                         :status     :pending})
      (testing "a lookup finds the row it was given"
        (is (= index-1 (:index_name (first (search.db/index-metadata engine version "en"))))))
      (testing "an injected version deletes nothing"
        (is (zero? (search.db/delete-index-metadata-by-version! injection)))
        (is (= 1 (count (search.db/index-metadata engine version "en")))))
      (testing "an injected lang-code deletes nothing"
        (is (zero? (search.db/delete-expired-pending-index-metadata! injection (t/offset-date-time))))
        (is (= 1 (count (search.db/index-metadata engine version "en")))))
      (testing "an injected index-name deletes nothing"
        (is (zero? (search.db/delete-non-active-index-metadata! engine version "en" injection)))
        (is (= 1 (count (search.db/index-metadata engine version "en")))))
      (testing "an injected version retires nothing"
        (is (zero? (search.db/retire-active-index-metadata! engine injection "en")))
        (is (= :pending (:status (first (search.db/index-metadata engine version "en"))))))
      (testing "the real coordinates still delete the row"
        (is (= 1 (search.db/delete-non-active-index-metadata! engine version "en" index-1)))
        (is (= [] (search.db/index-metadata engine version "en")))))))

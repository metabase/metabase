(ns metabase.search.models.search-index-metadata-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]))

(deftest lifecycle-test
  (t2/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
    (let [engine  :something-futureproof
          [version
           index-1
           index-2
           index-3
           index-4] (map str (repeatedly random-uuid))
          indexes #(->> (t2/select :model/SearchIndexMetadata :engine engine :version version)
                        (u/index-by :status :index_name))]
      (testing "You can create a pending index."
        (is (search-index-metadata/create-pending! engine version index-1)))
      (is (= {:pending index-1} (indexes)))
      (testing "You cannot make a new index while there is already one pending."
        (is (false? (search-index-metadata/create-pending! engine version index-2))))
      (testing "You can activate an index"
        (is (= index-1 (search-index-metadata/active-pending! engine version)))
        (is (= {:active index-1} (indexes))))
      (testing "If there is no pending index, it will return the current index"
        (is (= index-1 (search-index-metadata/active-pending! engine version))))
      (testing "You can retire an index"
        (is (search-index-metadata/create-pending! engine version index-2))
        (is (= {:active index-1 :pending index-2} (indexes)))
        (is (= index-2 (search-index-metadata/active-pending! engine version)))
        (is (= {:retired index-1 :active index-2} (indexes))))
      (testing "You can continue the cycle indefinitely"
        (is (search-index-metadata/create-pending! engine version index-3))
        (is (= {:retired index-1 :active index-2 :pending index-3} (indexes)))
        (is (= index-3 (search-index-metadata/active-pending! engine version)))
        (is (= {:retired index-2 :active index-3} (indexes)))
        (is (search-index-metadata/create-pending! engine version index-4))
        (is (= {:retired index-2 :active index-3 :pending index-4} (indexes)))))))

(deftest delete-obsolete!-test
  (t2/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
    (let [engine        :something-futureproof
          n             5
          kept          3
          versions      (map str (repeatedly n random-uuid))
          ;; to make things interesting, we're not using the latest one
          our-version   (nth versions 3)
          ;; Start from a clean slate (rolled back at the end of the transaction): the app DB may already hold a
          ;; real (appdb) serving index whose metadata delete-obsolete! now deliberately protects, which would
          ;; otherwise skew the most-recent ranking and these counts.
          _             (t2/delete! :model/SearchIndexMetadata)
          index-count   #(t2/count :model/SearchIndexMetadata :engine engine)
          initial-count (index-count)]
      ;; create a bunch of indexes, more than we will want to keep
      (doseq [v versions]
        ;; use the version as the index name, for convenience
        (search-index-metadata/create-pending! engine v v))
      (is (= n (- (index-count) initial-count)))
      (testing "It deletes all but N of the versions"
        (search-index-metadata/delete-obsolete! our-version)
        (is (= kept (index-count))))
      (testing "It is idempotent"
        (search-index-metadata/delete-obsolete! our-version)
        (is (= kept (index-count))))
      (testing "It keeps the latest versions"
        (is (= (set (take-last 3 versions))
               (t2/select-fn-set :version :model/SearchIndexMetadata :engine engine))))
      (testing "After 1 day, it deletes version which are neither the latest, nor used by this instance"
        (mt/with-dynamic-fn-redefs [t/zoned-date-time (constantly (t/plus (t/zoned-date-time) (t/days 1) (t/minutes 1)))]
          (search-index-metadata/delete-obsolete! our-version)
          (is (= #{our-version (last versions)}
                 (t2/select-fn-set :version :model/SearchIndexMetadata :engine engine))))))))

(deftest delete-obsolete!-keeps-serving-version-test
  (testing "a version still serving an ACTIVE index is never pruned by the most-recent window, even when newer
           (e.g. transient/test-only) versions crowd it out -- dropping its metadata would orphan its live table,
           which then gets swept and breaks in-flight reads/writes"
    (t2/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
      (let [engine  :something-futureproof
            serving (str (random-uuid))
            ;; four *newer* versions, created after `serving`, so `serving` (oldest updated_at + lowest id) falls
            ;; outside the 3-most-recent window.
            newer   (mapv (fn [_] (str (random-uuid))) (range 4))]
        (search-index-metadata/create-pending! engine serving serving)
        (search-index-metadata/active-pending! engine serving)        ; `serving` is now :active
        (doseq [v newer]
          (search-index-metadata/create-pending! engine v v))
        ;; our-version is one of the throwaway newer versions, NOT `serving`
        (search-index-metadata/delete-obsolete! (first newer))
        (is (contains? (t2/select-fn-set :version :model/SearchIndexMetadata :engine engine) serving)
            "the serving version's metadata must survive being crowded out of the most-recent window")))))

(comment
  (t2/delete! :model/SearchIndexMetadata :engine :something-futureproof))

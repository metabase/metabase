(ns metabase.glossary.queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.glossary.queries :as glossary.queries]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest glossary-entry-by-term-test
  (mt/with-temp [:model/Glossary _ {:term "ARR" :definition "annual recurring revenue"}
                 :model/Glossary _ {:term "MAU" :definition "monthly active users"}]
    (testing "the term is compared as a value"
      (is (= "annual recurring revenue" (:definition (glossary.queries/glossary-entry-by-term "ARR")))))
    (testing "a term that looks like SQL matches nothing rather than being compiled"
      (is (nil? (glossary.queries/glossary-entry-by-term "ARR' OR '1'='1"))))))

(deftest update-glossary-entry-test
  (mt/with-temp [:model/Glossary {id :id} {:term "ARR" :definition "annual recurring revenue"}]
    (testing "term and definition are written as values"
      (glossary.queries/update-glossary-entry! id "MAU" "monthly active users")
      (let [entry (glossary.queries/glossary-entry id)]
        (is (= "MAU" (:term entry)))
        (is (= "monthly active users" (:definition entry)))))
    (testing "a definition that looks like SQL is stored as text"
      (let [payload "'); DROP TABLE glossary; --"]
        (glossary.queries/update-glossary-entry! id "MAU" payload)
        (is (= payload (:definition (glossary.queries/glossary-entry id))))))))

(deftest glossary-entries-search-test
  (mt/with-temp [:model/Glossary _ {:term "ARR" :definition "annual recurring revenue"}
                 :model/Glossary _ {:term "MAU" :definition "monthly active users"}]
    (testing "search matches term or definition case-insensitively"
      (is (= ["ARR"] (map :term (glossary.queries/glossary-entries "arr"))))
      (is (= ["MAU"] (map :term (glossary.queries/glossary-entries "ACTIVE")))))
    (testing "a wildcard in the search string is matched literally, not as a pattern"
      (is (empty? (glossary.queries/glossary-entries "%"))))
    (testing "nil search returns every entry"
      (is (= ["ARR" "MAU"] (map :term (glossary.queries/glossary-entries nil)))))))

(deftest glossary-entry-lifecycle-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [entry (glossary.queries/insert-glossary-entry!
                 {:term "KPI" :definition "key performance indicator" :creator_id user-id})]
      (testing "insert stamps the timestamps the :hook/timestamped? hook would have"
        (is (some? (:created_at entry)))
        (is (some? (:updated_at entry))))
      (testing "the inserted entry is a model instance, so hydration composes"
        (is (= user-id (:id (:creator (t2/hydrate entry :creator))))))
      (testing "update writes the new values and leaves created_at alone"
        (glossary.queries/update-glossary-entry! (:id entry) "KPI2" "d2")
        (let [after (glossary.queries/glossary-entry (:id entry))]
          (is (= "KPI2" (:term after)))
          (is (= "d2" (:definition after)))
          (is (= (:created_at entry) (:created_at after)))))
      (testing "delete removes the row"
        (glossary.queries/delete-glossary-entry! (:id entry))
        (is (nil? (glossary.queries/glossary-entry (:id entry))))))))

(deftest users-by-id-test
  (mt/with-temp [:model/User {u1 :id} {:email "a@b.com"}
                 :model/User {u2 :id} {:email "c@d.com"}]
    (testing "returns a map of id to user"
      (is (= #{u1 u2} (set (keys (glossary.queries/users-by-id #{u1 u2}))))))
    (testing "an empty id set returns an empty map without querying an empty IN ()"
      (is (= {} (glossary.queries/users-by-id #{}))))))

(deftest sql-text-is-constant-test
  (testing "the statement text does not vary with input; only the params do"
    (let [[sql-a & params-a] (#'glossary.queries/glossary-entry-by-term-sqlvec {:term "ARR"})
          [sql-b & params-b] (#'glossary.queries/glossary-entry-by-term-sqlvec
                              {:term "ARR' OR '1'='1"})]
      (is (= sql-a sql-b))
      (is (= ["ARR"] params-a))
      (is (= ["ARR' OR '1'='1"] params-b))))
  (testing "searching and not searching compile to the same statement"
    (is (= (first (#'glossary.queries/glossary-entries-sqlvec {:search? 1 :pattern "%a%"}))
           (first (#'glossary.queries/glossary-entries-sqlvec {:search? 0 :pattern ""}))))))

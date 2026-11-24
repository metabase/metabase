(ns metabase-enterprise.sandbox.query-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- run-check-outcome
  "What `thunk`, a run permissions check, does: `:allowed`, or the message and data without the query it throws."
  [thunk]
  (try
    (thunk)
    :allowed
    (catch Throwable e
      {:message (ex-message e)
       :data    (dissoc (ex-data e) :query)})))

(defn- grant-native!
  "Gives `group` native query permissions on the Database with `db-id`."
  [group db-id]
  (perms/set-database-permission! group db-id :perms/view-data :unrestricted)
  (perms/set-database-permission! group db-id :perms/create-queries :query-builder-and-native))

(deftest check-run-permissions-for-queries-sandboxed-user-matches-single-check-test
  (testing "for a sandboxed user each query of a batch is allowed or refused exactly as when it is checked alone"
    (met/with-gtaps! {:gtaps {:venues {}}}
      (mt/with-temp [:model/Database {db-b-id :id} {:engine :h2 :details (:details (mt/db))}]
        (grant-native! &group (mt/id))
        (grant-native! &group db-b-id)
        (let [mp      (lib-be/application-database-metadata-provider (mt/id))
              mp-b    (lib-be/application-database-metadata-provider db-b-id)
              queries [[:mbql-sandboxed     (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
                       [:native-sandboxed   (lib/native-query mp "SELECT 1")]
                       [:native-unsandboxed (lib/native-query mp-b "SELECT 1")]]
              single  (into {} (map (fn [[k q]] [k (run-check-outcome #(query-perms/check-run-permissions-for-queries [q]))]))
                            queries)]
          (testing "a native query is refused only on the Database with the sandbox"
            (is (= #{:mbql-sandboxed :native-unsandboxed}
                   (into #{} (comp (filter #(= :allowed (val %))) (map key)) single)))
            (is (=? {:data {:status-code 403}} (single :native-sandboxed))))
          (doseq [[k q] queries]
            (testing (str k " checked last in a batch after every allowed query")
              (is (= (single k)
                     (run-check-outcome #(query-perms/check-run-permissions-for-queries
                                          (conj (into [] (comp (filter (comp #{:allowed} single first)) (map second)) queries)
                                                q)))))))
          (testing "a batch with one refused query throws as that query does alone"
            (is (= (single :native-sandboxed)
                   (run-check-outcome #(query-perms/check-run-permissions-for-queries (mapv second queries)))))))))))

(deftest query-run-answers-sandboxed-user-matches-one-query-calls-test
  (testing "for a sandboxed user each query of a batch is answered exactly as when it is asked on its own"
    (met/with-gtaps! {:gtaps {:venues {}}}
      (mt/with-temp [:model/Database {db-b-id :id} {:engine :h2 :details (:details (mt/db))}]
        (grant-native! &group (mt/id))
        (grant-native! &group db-b-id)
        (let [mp      (lib-be/application-database-metadata-provider (mt/id))
              mp-b    (lib-be/application-database-metadata-provider db-b-id)
              queries [(lib/query mp (lib.metadata/table mp (mt/id :venues)))
                       (lib/native-query mp "SELECT 1")
                       (lib/native-query mp-b "SELECT 1")]
              answers (fn []
                        [(mapv #(first (query-perms/query-run-answers [%])) queries)
                         (query-perms/query-run-answers queries)])]
          (testing "with the sandbox enforced, a native query is refused only on the Database with the sandbox"
            (is (= [[true false true] [true false true]]
                   (answers))))
          (testing "with the sandbox lifted by a second group with unrestricted data access, every query may run"
            (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                           :model/PermissionsGroupMembership _              {:group_id group-id
                                                                             :user_id  (mt/user->id :rasta)}]
              (grant-native! group-id (mt/id))
              (mt/with-current-user (mt/user->id :rasta)
                (is (= [[true true true] [true true true]]
                       (answers)))))))))))

(deftest check-run-permissions-for-queries-sandboxed-user-statement-count-test
  (testing "for a sandboxed user, only preprocessing grows the run permissions of native queries with their Databases"
    (met/with-gtaps! {:gtaps {:venues {}}}
      (mt/with-temp [:model/Database {db-1 :id} {:engine :h2 :details (:details (mt/db))}
                     :model/Database {db-2 :id} {:engine :h2 :details (:details (mt/db))}
                     :model/Database {db-3 :id} {:engine :h2 :details (:details (mt/db))}
                     :model/Database {db-4 :id} {:engine :h2 :details (:details (mt/db))}
                     :model/Database {db-5 :id} {:engine :h2 :details (:details (mt/db))}
                     :model/Database {db-6 :id} {:engine :h2 :details (:details (mt/db))}]
        (let [db-ids [db-1 db-2 db-3 db-4 db-5 db-6]]
          (run! #(grant-native! &group %) db-ids)
          (let [queries     (mapv #(lib/native-query (lib-be/application-database-metadata-provider %) "SELECT 1") db-ids)
                count!      (fn [f n]
                              (lib-be/with-metadata-provider-cache
                                (f queries)
                                (t2/with-call-count [call-count]
                                  (f (take n queries))
                                  (call-count))))
                check!      (partial count! query-perms/check-run-permissions-for-queries)
                preprocess! (partial count! #(request/as-admin (run! qp.preprocess/preprocess %)))]
            (is (= (- (check! 6) (check! 2))
                   (- (preprocess! 6) (preprocess! 2))))))))))

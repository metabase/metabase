(ns metabase-enterprise.tenants.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest partitioned-reads-and-updates-test
  (mt/with-temp [:model/Tenant {tenant-a :id name-a :name slug-a :slug} {}
                 :model/Tenant {tenant-b :id name-b :name} {}
                 :model/Tenant {tenant-c :id} {}]
    (let [reads  (fn []
                   {:name-or-slug    (tenants.db/tenant-name-or-slug-exists? ["x" "y" "z" name-b] ["p" "q" "r" "s" slug-a])
                    :no-name-or-slug (tenants.db/tenant-name-or-slug-exists? ["x" "y" "z"] ["p" "q" "r" "s" "t"])
                    :named-outside   (tenants.db/tenant-named-outside? ["x" "y" name-a name-b] [tenant-a tenant-c tenant-b])
                    :named-other     (tenants.db/tenant-named-outside? ["x" "y" name-a name-b] [tenant-a tenant-c])})
          single (reads)]
      (testing "existence over several partitions answers as one statement does"
        (is (= {:name-or-slug true :no-name-or-slug false :named-outside false :named-other true} single))
        (is (= single (with-redefs [mdb.query/select-partition-size 2] (reads))))))
    (testing "deactivating more Tenants than one partition updates and counts all of them"
      (is (= 3 (with-redefs [mdb.query/update-partition-size 2]
                 (tenants.db/deactivate-tenants! [tenant-a tenant-b tenant-c]))))
      (is (= #{false} (t2/select-fn-set :is_active :model/Tenant :id [:in [tenant-a tenant-b tenant-c]]))))))

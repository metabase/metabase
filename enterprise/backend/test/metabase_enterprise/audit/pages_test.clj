(ns metabase-enterprise.audit.pages-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.java.classpath :as classpath]
            [clojure.tools.namespace.find :as ns-find]
            [metabase
             [models :refer [Card Dashboard DashboardCard Database Table]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings.metastore-test :as metastore-test]
            [metabase.query-processor.util :as qp-util]
            [metabase.test.fixtures :as fixtures]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(use-fixtures :once (fixtures/initialize :db))

(deftest preconditions-test
  (classloader/require 'metabase-enterprise.audit.pages.dashboards)
  (testing "the query should exist"
    (is (some? (resolve (symbol "metabase-enterprise.audit.pages.dashboards/most-popular-with-avg-speed")))))

  (testing "test that a query will fail if not ran by an admin"
    (metastore-test/with-metastore-token-features #{:audit-app}
      (is (= {:status "failed", :error "You don't have permissions to do that."}
             (-> (mt/user-http-request :lucky :post 202 "dataset"
                                       {:type :internal
                                        :fn   "metabase-enterprise.audit.pages.dashboards/most-popular-with-avg-speed"})
                 (select-keys [:status :error]))))))

  (testing "ok, now try to run it. Should fail because we don't have audit-app enabled"
    (metastore-test/with-metastore-token-features nil
      (is (= {:status "failed", :error "Audit App queries are not enabled on this instance."}
             (-> (mt/user-http-request :crowberto :post 202 "dataset"
                                       {:type :internal
                                        :fn   "metabase-enterprise.audit.pages.dashboards/most-popular-with-avg-speed"})
                 (select-keys [:status :error])))))))

(defn- all-queries []
  (for [ns-symb  (ns-find/find-namespaces (classpath/system-classpath))
        :when    (and (str/starts-with? (name ns-symb) "metabase-enterprise.audit.pages")
                      (not (str/ends-with? (name ns-symb) "-test")))
        [_ varr] (do (classloader/require ns-symb)
                     (ns-interns ns-symb))
        :when    (:internal-query-fn (meta varr))]
    varr))

(defn- varr->query [varr {:keys [database table card dash]}]
  (let [mta     (meta varr)
        fn-str  (str (ns-name (:ns mta)) "/" (:name mta))
        arglist (mapv keyword (first (:arglists mta)))]
    {:type :internal
     :fn   fn-str
     :args (for [arg arglist]
             (case arg
               :datetime-unit "day"
               :dashboard-id  (u/get-id dash)
               :card-id       (u/get-id card)
               :user-id       (mt/user->id :crowberto)
               :database-id   (u/get-id database)
               :table-id      (u/get-id table)
               :model         "card"
               :query-hash    (codec/base64-encode (qp-util/query-hash {:database 1, :type :native}))))}))

(defn- test-varr
  [varr objects]
  (testing (format "%s %s:%d" varr (ns-name (:ns (meta varr))) (:line (meta varr)))
    (let [query (varr->query varr objects)]
      (testing (format "\nquery =\n%s" (u/pprint-to-str query))
        (is (schema= {:status (s/eq :completed)
                      s/Keyword s/Any}
                     (qp/process-query query)))))))

(defn- do-with-temp-objects [f]
  (mt/with-temp* [Database      [database]
                  Table         [table {:db_id (u/get-id database)}]
                  Card          [card {:table_id (u/get-id table), :database_id (u/get-id database)}]
                  Dashboard     [dash]
                  DashboardCard [_ {:card_id (u/get-id card), :dashboard_id (u/get-id dash)}]]
    (f {:database database, :table table, :card card, :dash dash})))

(defmacro ^:private with-temp-objects [[objects-binding] & body]
  `(do-with-temp-objects (fn [~objects-binding] ~@body)))

(deftest all-queries-test
  (mt/with-test-user :crowberto
     (with-temp-objects [objects]
       (metastore-test/with-metastore-token-features #{:audit-app}
         (doseq [varr (all-queries)]
           (test-varr varr objects))))))

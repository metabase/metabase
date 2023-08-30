(ns metabase-enterprise.audit-app.pages-test
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.reader :as tools.reader]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase.models :refer [Card Dashboard DashboardCard Database Table User]]
   [metabase.models.permissions :as perms]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [schema.core :as s]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest preconditions-test
  (classloader/require 'metabase-enterprise.audit-app.pages.dashboards)
  (testing "the method should exist"
    (is (fn? (get-method audit.i/internal-query :metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed))))

  (testing "test that a query will fail if not ran by an admin"
    (premium-features-test/with-premium-features #{:audit-app}
      (is (= {:status "failed", :error "You don't have permissions to do that."}
             (-> (mt/user-http-request :lucky :post 202 "dataset"
                                       {:type :internal
                                        :fn   "metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed"})
                 (select-keys [:status :error]))))))

  (testing "ok, now try to run it. Should fail because we don't have audit-app enabled"
    (premium-features-test/with-premium-features nil
      (is (= {:status "failed", :error "Audit App queries are not enabled on this instance."}
             (-> (mt/user-http-request :crowberto :post 202 "dataset"
                                       {:type :internal
                                        :fn   "metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed"})
                 (select-keys [:status :error]))))))

  (testing "non-admin users with monitoring permissions"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (perms/grant-application-permissions! group :monitoring)
      (testing "still fail if advanced-permissions is disabled"
        (premium-features-test/with-premium-features #{:audit-app}
          (is (= {:status "failed", :error "You don't have permissions to do that."}
                 (-> (mt/user-http-request user :post 202 "dataset"
                                           {:type :internal
                                            :fn   "metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed"})
                     (select-keys [:status :error]))))))

      (testing "run successfully if advanced-permissions enabled)"
        (premium-features-test/with-premium-features #{:audit-app :advanced-permissions}
          (is (= {:status "completed"}
                 (-> (mt/user-http-request user :post 202 "dataset"
                                           {:type :internal
                                            :fn   "metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed"})
                     (select-keys [:status])))))))))

(defn- all-query-methods
  "Return a set of all audit/internal query types (excluding test/`:default` impls)."
  []
  ;; load all `metabase-enterprise.audit-app.pages` namespaces.
  (doseq [ns-symb  (ns.find/find-namespaces (classpath/system-classpath))
          :when    (and (str/starts-with? (name ns-symb) "metabase-enterprise.audit-app.pages")
                        (not (str/ends-with? (name ns-symb) "-test")))]
    (classloader/require ns-symb))
  ;; now find all the impls of [[metabase-enterprise.audit-app.interface/internal-query]] from the pages namespaces
  (into (sorted-set)
        (filter (fn [query-type]
                  (when-let [ns-str (namespace query-type)]
                    (and (str/starts-with? ns-str "metabase-enterprise.audit-app.pages.")
                         (not (str/ends-with? ns-str "-test"))))))
        (keys (methods audit.i/internal-query))))

(defn- query-defmethod-source-form
  "Find the source [[defmethod]] or [[schema.core/defmethod]] form for the internal query named by `query-type`."
  [query-type]
  (let [file    (-> (namespace query-type)
                    munge
                    (str/replace #"\." "/")
                    (str ".clj"))
        ns-symb (symbol (namespace query-type))]
    (with-open [reader (java.io.PushbackReader. (io/reader (io/resource file)))]
      (binding [*ns* (the-ns ns-symb)]
        (loop []
          (let [form (tools.reader/read reader false ::eof)]
            (cond
              (= form ::eof)
              (throw (ex-info (str "Cannot find source for " query-type)
                              {:namespace ns-symb, :file file}))

              (and (seq? form)
                   (#{'defmethod 's/defmethod} (first form))
                   (= (second form) 'audit.i/internal-query)
                   (= (nth form 2) query-type))
              form

              :else
              (recur))))))))

(defn- arglist-strip-schema-annotations
  "Remove Schema `:-` annotations from `arglist`."
  [arglist]
  (let [remove-next? (volatile! false)]
    (into []
          (remove (fn [value]
                    (cond
                      (= value :-)
                      (do
                        (vreset! remove-next? true)
                        true)

                      @remove-next?
                      (do
                        (vreset! remove-next? false)
                        true)

                      :else
                      false)))
          arglist)))

(defn- query-defmethod-arglists
  "Return a sequence of arglists for the internal query named by `query-type`."
  [query-type]
  (let [fn-tail (drop 3 (query-defmethod-source-form query-type))]
    (mapv arglist-strip-schema-annotations
          (if (vector? (first fn-tail))
            [(first fn-tail)]
            (map first fn-tail)))))

(defn- test-query-maps
  "Generate a sequence of test query maps (as you'd pass to the QP) for the internal query named by `query-type`.
  Generates one map for arity of the method."
  [query-type {:keys [database table card dash]}]
  (for [arglist (query-defmethod-arglists query-type)]
    {:type :internal
     :fn   (u/qualified-name query-type)
     :args (for [arg (mapv keyword (rest arglist))]
             (case arg
               :datetime-unit     "day"
               :dashboard-id      (u/the-id dash)
               :card-id           (u/the-id card)
               :user-id           (mt/user->id :crowberto)
               :database-id       (u/the-id database)
               :table-id          (u/the-id table)
               :model             "card"
               :query-hash        (codec/base64-encode (qp.util/query-hash {:database 1, :type :native}))
               :query-string      "toucans"
               :question-filter   "bird sales"
               :collection-filter "coin collection"
               :error-filter      "a"
               :db-filter         "PU"
               :sort-column       "card.id"
               :sort-direction    "desc"
               :dashboard-name    "wow"
               :card-name         "Credit Card"))}))

(defn- do-tests-for-query-type
  "Run test(s) for the internal query named by `query-type`. Runs one test for each map returned
  by [[test-query-maps]]."
  [query-type objects]
  (doseq [query (test-query-maps query-type objects)]
    (testing (format "\nquery =\n%s" (u/pprint-to-str query))
      (is (schema= {:status (s/eq :completed)
                    s/Keyword s/Any}
                   (qp/process-query query))))))

(defn- do-with-temp-objects [f]
  (mt/with-temp* [Database      [database]
                  Table         [table {:db_id (u/the-id database)}]
                  Card          [card {:table_id (u/the-id table), :database_id (u/the-id database)}]
                  Dashboard     [dash]
                  DashboardCard [_ {:card_id (u/the-id card), :dashboard_id (u/the-id dash)}]]
    (f {:database database, :table table, :card card, :dash dash})))

(defmacro ^:private with-temp-objects [[objects-binding] & body]
  `(do-with-temp-objects (fn [~objects-binding] ~@body)))

(deftest all-queries-test
  (mt/with-test-user :crowberto
    (with-temp-objects [objects]
      (premium-features-test/with-premium-features #{:audit-app}
        (doseq [query-type (all-query-methods)]
          (testing query-type
            (do-tests-for-query-type query-type objects)))))))

(deftest user-full-name-test
  (testing "User name fallback to email, implemented in `metabase-enterprise.audit-app.pages.common/user-full-name` works in audit queries."
    (mt/with-test-user :crowberto
      (premium-features-test/with-premium-features #{:audit-app}
        (mt/with-temp* [User [a {:first_name "a" :last_name nil :email "a@metabase.com"}]
                        User [b {:first_name nil :last_name "b" :email "b@metabase.com"}]
                        User [c {:first_name nil :last_name nil :email "c@metabase.com"}]]
          (is (= #{"a" "b" "c@metabase.com"}
                 (->> (get-in (mt/user-http-request :crowberto :post 202 "dataset"
                                                    {:type :internal
                                                     :fn   "metabase-enterprise.audit-app.pages.users/table"})
                              [:data :rows])
                      (filter #((set (map u/the-id [a b c])) (first %)))
                      (map second)
                      set))))))))

(deftest user-login-method-test
  (testing "User login method takes into account both the google_auth and sso_source columns"
    (mt/with-test-user :crowberto
      (premium-features-test/with-premium-features #{:audit-app}
        (mt/with-temp* [User [a {:email "a@metabase.com" :sso_source nil}]
                        User [b {:email "b@metabase.com" :sso_source :google}]
                        User [c {:email "c@metabase.com" :sso_source :saml}]
                        User [d {:email "d@metabase.com" :sso_source :jwt}]
                        User [e {:email "e@metabase.com" :sso_source :ldap}]]
          (is (= ["Email" "Google Sign-In" "SAML" "JWT" "LDAP"]
                 (->> (get-in (mt/user-http-request :crowberto :post 202 "dataset"
                                                    {:type :internal
                                                     :fn   "metabase-enterprise.audit-app.pages.users/table"})
                              [:data :rows])
                      (sort-by first)
                      (filter #((set (map u/the-id [a b c d e])) (first %)))
                      (map #(nth % 6))))))))))

(deftest active-and-new-by-time-test
  (testing "The active-and-new-by-time audit query correctly returns results (#32244)"
    (mt/with-test-user :crowberto
      (premium-features-test/with-premium-features #{:audit-app}
        (let [results (mt/user-http-request :crowberto :post 202 "dataset"
                                            {:type :internal
                                             :fn   "metabase-enterprise.audit-app.pages.users/active-and-new-by-time"
                                             :args ["day"]})]
          (is (not= 0
                    (count (-> results :data :rows)))))))))

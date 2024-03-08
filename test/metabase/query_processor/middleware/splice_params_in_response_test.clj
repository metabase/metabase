(ns metabase.query-processor.middleware.splice-params-in-response-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.splice-params-in-response
    :as splice-params-in-response]
   [metabase.test :as mt]
   [metabase.test.data :as data]))

(defn- do-with-splice-params-call? [thunk]
  (with-redefs [driver/splice-parameters-into-native-query (fn [& args]
                                                             {::call (cons 'splice-parameters-into-native-query args)})]
    (thunk)))

(defmacro ^:private with-splice-params-call?
  "Instead of actually calling `splice-parameters-into-native-query`, the results and correct implementation of which
  are not our problem, replace the results of a form showing the function call that is made (if any)."
  [& body]
  `(do-with-splice-params-call? (fn [] ~@body)))

(defn- splice-params [metadata]
  (with-splice-params-call?
    (driver/with-driver :h2
      ((splice-params-in-response/splice-params-in-response {} identity) metadata))))

(deftest basic-test
  (testing "Middleware should attempt to splice parameters into native query for queries that have params"
    (is (= {:native_form {::call '(splice-parameters-into-native-query :h2 {:query  "SELECT * FROM birds WHERE name = ?"
                                                                            :params ["Reggae"]})}}
           (splice-params {:native_form {:query "SELECT * FROM birds WHERE name = ?", :params ["Reggae"]}})))))

(deftest empty-params-test
  (testing "No splicing should be attempted if `:params` is empty"
    (is (= {:native_form {:query "SELECT * FROM birds WHERE name IS NOT NULL", :params []}}
           (splice-params {:native_form {:query "SELECT * FROM birds WHERE name IS NOT NULL", :params []}})))))

;; (These tests do not neccesarily belong in this namespace, but `metabase.query-processor-test` currently isn't used
;; for actual tests, so since these are related to the middleware tests above, they will live here for now)

(defn- sushi-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [[:field (data/id :venues :id) nil]]
              :filter       [:= [:field (data/id :venues :name) nil] "Beyond Sushi"]
              :limit 1}})

(deftest compile-and-splice-parameters
  (testing "`qp.compile/compile-and-splice-parameters`, should, as the name implies, attempt to splice the params into the query"
    (with-splice-params-call?
      (is (= {::call '(splice-parameters-into-native-query
                       :h2
                       {:query  "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = ? LIMIT 1"
                        :params ["Beyond Sushi"]})}
             (qp.compile/compile-and-splice-parameters (sushi-query)))))))

(deftest compile-test
  (testing "`compile` should not call `splice-parameters-into-native-query`"
    (with-splice-params-call?
      (is (=? {:query  "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = ? LIMIT 1"
               :params ["Beyond Sushi"]}
              (qp.compile/compile (sushi-query)))))))

(deftest ^:parallel e2e-test
  (testing (str "`splice-parameters-into-native-query` should get called on the `:native_form` returned in query "
                "results, because this is currently what is ultimately used by the frontend when you click 'Convert "
                "this Question to SQL'")
    ;; (This is implied by the middleware tests above; this test serves as an end-to-end test to verify that the
    ;; middleware is actually being applied)
    (is (=? {:data {:native_form {:query  "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = 'Beyond Sushi' LIMIT 1",
                                  :params nil}}}
            (qp/process-query
             {:database (mt/id)
              :type     :native
              :native   {:query  "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = ? LIMIT 1"
                         :params ["Beyond Sushi"]}})))))

(ns metabase.query-processor.middleware.splice-params-in-response-test
  (:require [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]]
            [metabase.query-processor.middleware.splice-params-in-response :as splice-params-in-response]
            [metabase.test.data :as data]))

(defn- do-with-splice-params-call? [f]
  (with-redefs [driver/splice-parameters-into-native-query (fn [& args]
                                                             (cons 'splice-parameters-into-native-query args))]
    (f)))

(defmacro ^:private with-splice-params-call?
  "Instead of actually calling `splice-parameters-into-native-query`, the results and correct implementation of which
  are not our problem, replace the results of a form showing the function call that is made (if any)."
  [& body]
  `(do-with-splice-params-call? (fn [] ~@body)))

(defn- splice-params [qp-results]
  (with-splice-params-call?
    (driver/with-driver :h2
      ((splice-params-in-response/splice-params-in-response
        (constantly qp-results))
       {}))))

;; Middleware should attempt to splice parameters into native query for queries that have params
(expect
  {:status :completed
   :data
   {:native_form
    '(splice-parameters-into-native-query
      :h2
      {:query  "SELECT * FROM birds WHERE name = ?"
       :params ["Reggae"]})}}
  (splice-params
   {:status :completed
    :data   {:native_form {:query  "SELECT * FROM birds WHERE name = ?"
                           :params ["Reggae"]}}}))

;; If the query was not successfully completed then no splicing should be attempted!
(expect
  {:status :failed
   :data   {:native_form
            {:query "SELECT * FROM birds WHERE name = ?", :params ["Reggae"]}}}
  (splice-params
   {:status :failed
    :data   {:native_form {:query  "SELECT * FROM birds WHERE name = ?"
                           :params ["Reggae"]}}}))

;; No splicing should be attempted if `:params` is empty
(expect
  {:status :completed
   :data
   {:native_form
    {:query "SELECT * FROM birds WHERE name IS NOT NULL", :params []}}}
  (splice-params
   {:status :completed
    :data   {:native_form {:query  "SELECT * FROM birds WHERE name IS NOT NULL"
                           :params []}}}))

;; (These tests do not neccesarily belong in this namespace, but `metabase.query-processor-test` currently isn't used
;; for actual tests, so since these are related to the middleware tests above, they will live here for now)

(defn- sushi-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [[:field-id (data/id :venues :id)]]
              :filter       [:= [:field-id (data/id :venues :name)] "Beyond Sushi"]
              :limit 1}})

;; `qp/query->native-with-spliced-params`, should, as the name implies, attempt to splice the params into the query
(expect
  '(splice-parameters-into-native-query
    :h2
    {:query
     "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = ? LIMIT 1",
     :params ["Beyond Sushi"]})
  (with-splice-params-call?
    (qp/query->native-with-spliced-params
      (sushi-query))))

;; `query->native` should not call `splice-parameters-into-native-query`
(expect
  {:query
   "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = ? LIMIT 1",
   :params ["Beyond Sushi"]}
  (with-splice-params-call?
    (qp/query->native
      (sushi-query))))

;; `splice-parameters-into-native-query` should get called on the `:native_form` returned in query results,
;; because this is currently what is ultimately used by the frontend when you click 'Convert this Question to SQL'
;;
;; (This is implied by the middleware tests above; this test serves as an end-to-end test to verify that the
;; middleware is actually being applied)
(expect
  '(splice-parameters-into-native-query
    :h2
    {:query
     "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = ? LIMIT 1",
     :params ["Beyond Sushi"]}))

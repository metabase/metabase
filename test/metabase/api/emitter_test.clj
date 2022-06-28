(ns metabase.api.emitter-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.models
    :refer [Card
            CardEmitter
            Dashboard
            Database
            Emitter
            EmitterAction
            QueryAction]]
   [metabase.test :as mt]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(defn- do-with-query-action [f]
  (mt/with-temp* [Card [{card-id :id} {:database_id   (mt/id)
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query         (str "UPDATE categories\n"
                                                                                      "SET name = 'Bird Shop'\n"
                                                                                      "WHERE id = {{id}}")
                                                                  :template-tags {"id" {:name         "id"
                                                                                        :display-name "ID"
                                                                                        :type         :number
                                                                                        :required     true}}}}
                                       :is_write      true}]]
    (let [action-id (db/select-one-field :action_id QueryAction :card_id card-id)]
      (f {:query-action-card-id card-id
          :action-id            action-id}))))

(defn- do-with-card-emitter [{:keys [action-id], :as context} f]
  (mt/with-temp* [Card    [{emitter-card-id :id}]
                  Emitter [{emitter-id :id} {:parameter_mappings {"my_id" [:variable [:template-tag "id"]]}}]]
    (testing "Sanity check: emitter-id should be non-nil"
      (is (integer? emitter-id)))
    (testing "Sanity check: make sure parameter mappings were defined the way we'd expect"
      (is (= {:my_id [:variable [:template-tag "id"]]}
             (db/select-one-field :parameter_mappings Emitter :id emitter-id))))
    ;; these are tied to the Card and Emitter above and will get cascade deleted. We can't use `with-temp*` for them
    ;; because it doesn't seem to work with tables with compound PKs
    (db/insert! EmitterAction {:emitter_id emitter-id
                               :action_id action-id})
    (db/insert! CardEmitter {:card_id   emitter-card-id
                             :action_id action-id})
    (f (assoc context
              :emitter-id      emitter-id
              :emitter-card-id emitter-card-id))))

(defn- do-with-actions-setup [thunk]
  (actions.test-util/with-actions-test-data
    (mt/with-temporary-setting-values [experimental-enable-actions true]
      (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
        (thunk)))))

(deftest create-emitter-test
  (testing "POST /api/emitter"
    (testing "Creating an emitter with the POST endpoint should return the newly created Emitter"
      (do-with-actions-setup
       (fn []
         (do-with-query-action
          (fn [{:keys [action-id query-action-card-id]}]
            (let [expected-response {:id                 su/IntGreaterThanZero
                                     :parameter_mappings (s/eq nil)
                                     :action_id          (s/eq action-id)
                                     :action             {:type     (s/eq      "query")
                                                          :card     {:id       (s/eq query-action-card-id)
                                                                     s/Keyword s/Any}
                                                          s/Keyword s/Any}
                                     s/Keyword           s/Any}]
              (testing "CardEmitter"
                (mt/with-temp Card [{card-id :id}]
                  (is (schema= expected-response
                               (mt/user-http-request :crowberto :post 200 "emitter" {:card_id   card-id
                                                                                     :action_id action-id})))))
              (testing "DashboardEmitter"
                (mt/with-temp Dashboard [{dashboard-id :id}]
                  (is (schema= expected-response
                               (mt/user-http-request :crowberto :post 200 "emitter" {:dashboard_id dashboard-id
                                                                                     :action_id    action-id})))))))))))))

(deftest execute-custom-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (do-with-actions-setup
     (fn []
       (do-with-query-action
        (fn [context]
          (do-with-card-emitter
           context
           (fn [{:keys [emitter-id], :as _context}]
             (testing "Should be able to execute an emitter"
               (is (= {:rows-affected 1}
                      (mt/user-http-request :crowberto :post 200 (format "emitter/%d/execute" emitter-id)
                                            {:parameters {"my_id" {:type  :number/=
                                                                   :value 1}}}))))
             (is (= [1 "Bird Shop"]
                    (mt/first-row
                     (mt/run-mbql-query categories {:filter [:= $id 1]}))))))))))))

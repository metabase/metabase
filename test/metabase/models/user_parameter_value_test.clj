(ns metabase.models.user-parameter-value-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.user-parameter-value :as upv]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest user-parameter-value-store-test
  (mt/test-helpers-set-global-values!
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
      (let [store!      (fn [parameters]
                          (upv/store! (mt/user->id :rasta) dashboard-id parameters)
                          (Thread/sleep 110))
            retrieve-fn (fn []
                          (t2/select-fn->fn :parameter_id :value
                                            :model/UserParameterValue
                                            :user_id (mt/user->id :rasta) :dashboard_id dashboard-id))]
        (testing "insert upv if value is non-nil"
          (store! [{:id "param1" :value 1}
                   {:id "param2" :value "string"}
                   {:id "param3" :value ["A" "B" "C"]}])
          (is (= {"param1" 1
                  "param2" "string"
                  "param3" ["A" "B" "C"]}
                 (retrieve-fn))))

        (testing "delete if value is nil"
          (store! [{:id "param1" :value "foo"} {:id "param2" :value nil}])
          (is (= {"param1" "foo"
                  "param3" ["A" "B" "C"]}
                 (retrieve-fn))))

        (testing "update existing param and insert new param"
          (store! [{:id "param1", :value "new-value"} {:id "param2", :value "new-value"}])
          (is (= {"param1" "new-value"
                  "param2" "new-value"
                  "param3" ["A" "B" "C"]}
                 (retrieve-fn))))

        (testing "insert nil if param has default value"
          (store! [{:id "param4" :value nil :default "default"}])
          (is (= {"param1" "new-value"
                  "param2" "new-value"
                  "param3" ["A" "B" "C"]
                  "param4" nil}
                 (retrieve-fn))))))))

(deftest hydrate-last-used-param-values-test
  (let [rasta-id (mt/user->id :rasta)
        crowberto (mt/user->id :crowberto)]
    (mt/with-temp
      [:model/Dashboard          dash-1 {:parameters [{:id "param" :type :text} {:id "dash1-param" :type :text}]}
       :model/Dashboard          dash-2 {:parameters [{:id "param" :type :text} {:id "dash2-param" :type :text}]}
       :model/UserParameterValue _      {:user_id      rasta-id
                                         :dashboard_id (:id dash-1)
                                         :parameter_id "param"
                                         :value        "dash1-param-value"}
       :model/UserParameterValue _      {:user_id      rasta-id
                                         :dashboard_id (:id dash-1)
                                         :parameter_id "dash1-param"
                                         :value        "dash1-param-value"}
       :model/UserParameterValue _      {:user_id      rasta-id
                                         :dashboard_id (:id dash-2)
                                         :parameter_id "param"
                                         :value        "dash2-param-value"}
       :model/UserParameterValue _      {:user_id      rasta-id
                                         :dashboard_id (:id dash-2)
                                         :parameter_id "dash1-param"
                                         :value        "dash1-param-value"}
       ;; crowberto value
       :model/UserParameterValue _      {:user_id      crowberto
                                         :dashboard_id (:id dash-1)
                                         :parameter_id "param2"
                                         :value        "dash1-param-value"}]
      (testing "return only user param values for the current user"
        (is (= [{:id (:id dash-1)
                 :last_used_param_values {"param" "dash1-param-value"
                                          "dash1-param" "dash1-param-value"}}
                {:id (:id dash-2)
                 :last_used_param_values {"param" "dash2-param-value"
                                          "dash1-param" "dash1-param-value"}}]
               (binding [api/*current-user-id*  rasta-id]
                 (map #(select-keys % [:id :last_used_param_values])
                      (t2/hydrate [dash-1 dash-2] :last_used_param_values)))))))))

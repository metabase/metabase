(ns metabase.models.user-parameter-value-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.user-parameter-value :as upv]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-parameter-value-crud-test
  (let [user-id        (mt/user->id :rasta)
        original-count (t2/count :model/UserParameterValue)
        param-name     (str (random-uuid))
        value!         (fn
                         ([] (->> param-name
                                  (t2/select-one :model/UserParameterValue :user_id user-id :parameter_id)
                                  :value))
                         ([v] (upv/upsert! user-id param-name v)))]
    (try
      (doseq [[test-str value-in value-out value-update value-update-out] [["string" "A" "A" "B" "B"]
                                                                           ["key" :A "A" :B "B"]
                                                                           ["vectors"
                                                                            ["A" "B" "C"] ["A" "B" "C"]
                                                                            ["A" "B" "C" "D"] ["A" "B" "C" "D"]]]]
        (testing (format "User Parameter Value for %s values" test-str)
          (testing (format "Upsert creates new user parameter value entry if the param_id user_id pair doesn't exist")
            (value! value-in)
            (is (= (inc original-count) (t2/count :model/UserParameterValue)))
            (is (= value-out (value!))))

          (testing "Upsert updates user parameter value entry if the param_id user_id pair already exists"
            (value! value-update)
            (is (= (inc original-count) (t2/count :model/UserParameterValue)))
            (is (= value-update-out (value!))))

          (testing "Upsert deletes user parameter value entry if value is `nil`."
            (value! nil)
            (is (= original-count (count (t2/select :model/UserParameterValue))))
            (is (= nil (value!))))))
      (finally
        (t2/delete! :model/UserParameterValue :parameter_id param-name)))))

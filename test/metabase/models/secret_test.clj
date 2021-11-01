(ns metabase.models.secret-test
  (:require [clojure.test :refer :all]
            [metabase.models.secret :as secret :refer [Secret]]
            [metabase.test :as mt]
            [metabase.util.encryption-test :as encryption-test]))

(defn- check-secret []
  (doseq [value ["fourtytwo" (byte-array (range 0 100))]]
    (let [name        "Test Secret"
          kind        ::secret/password]
      (mt/with-temp Secret [{:keys [id] :as secret} {:name       name
                                                     :kind       kind
                                                     :value      value
                                                     :creator_id (mt/user->id :crowberto)}]
         (is (= name (:name secret)))
         (is (= kind (:kind secret)))
         (is (mt/secret-value-equals? value (:value secret)))
         (let [loaded (Secret id)]
           (is (= name (:name loaded)))
           (is (= kind (:kind loaded)))
           (is (mt/secret-value-equals? value (:value loaded))))))))

(deftest secret-retrieval-test
  (testing "A secret value can be retrieved successfully"
    (testing " when there is NO encryption key in place"
      (encryption-test/with-secret-key nil
        (check-secret)))
    (testing " when there is an encryption key in place"
      (encryption-test/with-secret-key (resolve 'encryption-test/secret)
        (check-secret)))))

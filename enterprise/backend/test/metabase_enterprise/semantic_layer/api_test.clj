(ns metabase-enterprise.semantic-layer.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-layer.api]
   [metabase.test :as mt]))

(comment metabase-enterprise.semantic-layer.api/keep-me)

(def ^:private endpoint "ee/semantic-layer/complexity")

(deftest complexity-endpoint-requires-superuser-test
  (testing "non-superusers are rejected"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 endpoint)))))

(deftest complexity-endpoint-returns-schema-shaped-response-test
  (testing "superusers receive a shape matching the endpoint's response schema"
    (let [resp (mt/user-http-request :crowberto :get 200 endpoint)]
      (is (=? {:library  {:total       nat-int?
                          :components {:entity-count      {:count nat-int? :score nat-int?}
                                       :name-collisions   {:pairs nat-int? :score nat-int?}
                                       :synonym-pairs     {:pairs nat-int? :score nat-int?}
                                       :field-count       {:count nat-int? :score nat-int?}
                                       :repeated-measures {:count nat-int? :score nat-int?}}}
               :universe {:total       nat-int?
                          :components map?}
               :meta     {:formula-version   pos-int?
                          :synonym-threshold number?}}
              resp)))))

(ns metabase-enterprise.sandbox.api.comments-test
  "Tests for special behavior of `/api/metabase/comment` endpoints in the Metabase Enterprise Edition."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]))

(deftest mention-entities-test
  (testing "Sandboxed users don't get to see other users"
    (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
      (is (=? {:data   [{:id int? :common_name "Rasta Toucan" :model "user"}]
               :total  1
               :limit  50
               :offset 0}
              (mt/user-http-request :rasta :get 200 "comment/mentions" :limit 50))))))

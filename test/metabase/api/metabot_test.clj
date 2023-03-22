(ns metabase.api.metabot-test
  (:require [clojure.test :refer :all]
            ;[metabase.models.permissions :as perms]
            ;[metabase.models.permissions-group :as perms-group]
            [metabase.test :as mt]
   ;[schema.core :as s]
            ))

(deftest simple-echo-test
  (testing "POST /api/metabot/model"
    (let [q "At what time was the status closed for each user?"
          {:keys [sql_query original_question suggested_visualization]
           :as   _response} (mt/user-http-request :rasta :post 200 "/metabot/model"
                                                  (assoc
                                                   (mt/mbql-query venues {:fields [$id $name]})
                                                    :question q))]
      (is (= original_question q)))))

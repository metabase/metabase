(ns metabase.api.metabot-test
  (:require [clojure.test :refer :all]
   ;[metabase.models.permissions :as perms]
   ;[metabase.models.permissions-group :as perms-group]
            [metabase.api.common :as api]
            [metabase.test :as mt]
   ;[schema.core :as s]
            [toucan2.core :as t2]))

(deftest simple-echo-test
  (testing "POST /api/metabot/model"
    (mt/dataset sample-dataset
      (let [q "At what time was the status closed for each user?"
            {:keys [sql_query original_question suggested_visualization]
             :as   _response} (mt/user-http-request :rasta :post 200 "/metabot/model"
                                                    {:database     (mt/id)
                                                     :source-model (mt/id :people)
                                                     :question     q
                                                     :fake         true})]
        (is (= original_question q))))))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 "/metabot/model"
     {:database     1
      :source-model 1036
      :question     "What is the total price of all purchases in the state of CA?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 "/metabot/model"
     {:database     1
      :source-model 1036
      :question     "What is the average rating of items in the mountain west?"}))
  )

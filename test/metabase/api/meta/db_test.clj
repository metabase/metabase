(ns metabase.api.meta.db-test
  (:require [expectations :refer :all]
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [match-$]]))

(expect
    (match-$ @test-db
      {:created_at $
       :engine "h2"
       :id $
       :details {:conn_str "file:t.db;AUTO_SERVER=TRUE"}
       :updated_at $
       :organization {:id (:id @test-org)
                      :slug "test"
                      :name "Test Organization"
                      :description nil
                      :logo_url nil
                      :inherits true}
       :name "Test Database"
       :organization_id (:id @test-org)
       :description nil})
  ((user->client :rasta) :get 200 (format "meta/db/%d" (:id @test-db))))

(ns metabase.driver.athena-test
  (:require [expectations :refer [expect]]
            [metabase.driver
             [generic-sql :as sql]])
  (:import metabase.driver.athena.AthenaDriver))


;; make sure connection details work as expected
(expect
  (str "//athena.us-east-1.amazonaws.com:443")
  (:subname (sql/connection-details->spec (AthenaDriver.) {:region "us-east-1"})))

(expect
  (str "user")
  (:user (sql/connection-details->spec (AthenaDriver.) {:user "user"})))

(expect
  (str "pwd")
  (:password (sql/connection-details->spec (AthenaDriver.) {:password "pwd"})))

(expect
  (str "s3://my-bucket/athena-results")
  (:s3_staging_dir (sql/connection-details->spec (AthenaDriver.) {:s3_staging_dir "s3://my-bucket/athena-results"})))

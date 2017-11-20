(ns metabase.driver.teradata-test
  (:require [expectations :refer :all]
    [metabase
     [sync :as sync]
     [util :as u]]
    [metabase.driver.generic-sql :as sql]
    [metabase.models.database :refer [Database]]
    [metabase.test
     [data :as data]
     [util :as tu]]
    [metabase.test.data
     [datasets :refer [expect-with-engine]]
     [interface :refer [def-database-definition]]]
    [toucan.db :as db]
    [toucan.util.test :as tt])
  (:import metabase.driver.teradata.TeradataDriver))

(def ^:private ^TeradataDriver teradata-driver (TeradataDriver.))

;; Check that additional JDBC options are handled correctly. This is comma separated for Teradata.
(expect
  "//localhost/CHARSET=UTF8,TMODE=ANSI,ENCRYPTDATA=ON,FINALIZE_AUTO_CLOSE=ON,LOB_SUPPORT=OFF,COP=OFF"
  (:subname (sql/connection-details->spec teradata-driver {:host               "localhost"
                                                           :additional-options "COP=OFF"})))
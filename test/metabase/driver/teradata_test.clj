(ns metabase.driver.teradata-test
  (:require [expectations :refer :all]
    [metabase.driver.generic-sql :as sql])
  (:import metabase.driver.teradata.TeradataDriver))

(def ^:private ^TeradataDriver teradata-driver (TeradataDriver.))

;; Check that additional JDBC options are handled correctly. This is comma separated for Teradata.
(expect
  "//localhost/CHARSET=UTF8,TMODE=ANSI,ENCRYPTDATA=ON,FINALIZE_AUTO_CLOSE=ON,LOB_SUPPORT=OFF,COP=OFF"
  (:subname (sql/connection-details->spec teradata-driver {:host               "localhost"
                                                           :additional-options "COP=OFF"})))
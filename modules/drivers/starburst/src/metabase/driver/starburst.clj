;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at

;;     http://www.apache.org/licenses/LICENSE-2.0

;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;;
(ns metabase.driver.starburst
  "Starburst driver."
  (:require [metabase.driver :as driver]
                        [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]))
(driver/register! :starburst, :parent #{::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(prefer-method driver/supports? [:starburst :set-timezone] [:sql-jdbc :set-timezone])

(defmethod driver/database-supports? [:starburst :persist-models]
  [_driver _feat _db]
  true)

(defmethod driver/database-supports? [:starburst :persist-models-enabled]
  [_driver _feat db]
  (-> db :options :persist-models-enabled))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Load implemetation files                                      |
;;; +----------------------------------------------------------------------------------------------------------------+
(load "implementation/query_processor")
(load "implementation/sync")
(load "implementation/execute")
(load "implementation/connectivity")
(load "implementation/unprepare")
(load "implementation/driver_helpers")
(load "implementation/ddl")

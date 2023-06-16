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
(ns metabase.driver.implementation.driver-helpers
  "Driver api implementation for Starburst driver."
  (:require [metabase.driver :as driver]))

;;; Starburst API helpers

(defmethod driver/db-start-of-week :starburst
  [_]
  :monday)

(defmethod driver/describe-table-fks :starburst [_ _ _]
  ;; Trino does not support finding foreign key metadata tables, but some connectors support foreign keys.
  ;; We have this return nil to avoid running unnecessary queries during fks sync.
  nil)

(doseq [[feature supported?] {:set-timezone                    true
                              :basic-aggregations              true
                              :standard-deviation-aggregations true
                              :expressions                     true
                              :native-parameters               true
                              :left-join                       true
                              :expression-aggregations         true
                              :binning                         true
                              :foreign-keys                    true
                              :datetime-diff                   true
                              :convert-timezone                true
                              :now                             true}]
  (defmethod driver/supports? [:starburst feature] [_ _] supported?))

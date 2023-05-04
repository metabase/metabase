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
(ns metabase.driver.implementation.unprepare"Unprepare implementation for Starburst driver."
  (:require [buddy.core.codecs :as codecs]
            [java-time :as t]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.util.unprepare :as unprepare])
  (:import [java.sql Time]
           java.sql.Time
           [java.time OffsetDateTime ZonedDateTime]))

(def ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

(defmethod unprepare/unprepare-value [:starburst String]
  [_ ^String s]
  (case *param-splice-style*
    :friendly (str \' (sql.u/escape-sql s :ansi) \')
    :paranoid (format "from_utf8(from_hex('%s'))" (codecs/bytes->hex (.getBytes s "UTF-8")))))

(defmethod unprepare/unprepare-value [:starburst Time]
  [driver t]
  ;; This is only needed for test purposes, because some of the sample data still uses legacy types
  ;; Convert time to Local time, then unprepare.
  (unprepare/unprepare-value driver (t/local-time t)))

(defmethod unprepare/unprepare-value [:starburst OffsetDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:starburst ZonedDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-id t)))

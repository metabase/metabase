(ns metabase.db.custom-migrations.pulse-to-notification-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [malli.error :as me]
   [metabase.db.custom-migrations.pulse-to-notification :as pulse-to-notification]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def fake-template-id 1337)

(defn alert-by-card-id
  [])

(defn migrate-alert!
  [pulse-id card-id]
  (#'pulse-to-notification/pulse->notification! (t2/select-one :pulse pulse-id)))

(deftest normal-alert-test)



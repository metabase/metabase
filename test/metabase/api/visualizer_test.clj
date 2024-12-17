(ns ^:mb/driver-tests metabase.api.visualizer-test
  "Tests for /api/visualizer endpoints."
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.macro :as tools.macro]
   [clojurewerkz.quartzite.scheduler :as qs]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [medley.core :as m]
   [metabase.api.card :as api.card]
   [metabase.api.pivots :as api.pivots]
   [metabase.api.test-util :as api.test-util]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.http-client :as client]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models
    :refer [Card CardBookmark Collection Dashboard Database ModerationReview
            Pulse PulseCard PulseChannel PulseChannelRecipient Table Timeline
            TimelineEvent]]
   [metabase.models.card.metadata :as card.metadata]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.revision :as revision]
   [metabase.permissions.util :as perms.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.request.core :as request]
   [metabase.task :as task]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.task.sync-databases :as task.sync-databases]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.upload-test :as upload-test]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))


(defn asdf
  [{:keys [search display dataset-columns] :as body}]
  (mt/user-http-request 1 :post 200
                        "/visualizer"
                        body))

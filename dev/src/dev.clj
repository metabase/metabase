;; # Metabase Backend Developer Documentation
;;
;; Welcome to Metabase! Here are links to useful resources.
;;
;; ## Project Management
;;
;; - [Engineering and Product Playbook](https://www.notion.so/metabase/Engineering-and-Product-Playbook-cd4bc1c0b8744470bebc0b979f8f5268)
;; - [Weekly Tactical Board: how to](https://www.notion.so/metabase/Weekly-Tactical-Board-how-to-6e81f994a792493ba7ae430f2afa1673)
;; - [The Escalations Process](https://www.notion.so/Escalating-a-bug-b876f78c801345f3bda8504d4a63ba80)
;;
;; ## Dev Environment
;;
;; - [Getting started with backend development](https://github.com/metabase/metabase/blob/master/docs/developers-guide/devenv.md#backend-development)
;; - [Additional notes on using tools.deps](https://github.com/metabase/metabase/wiki/Migrating-from-Leiningen-to-tools.deps)
;; - [Use the dev-scripts repo to run various local DBs](https://github.com/metabase/dev-scripts)
;; - If you're on a Mac and need a VM to run Windows or Linux, [check out UTM](https://mac.getutm.app/)
;;
;; ## Important Parts of the Codebase
;;
;; - [API Endpoints](#metabase.api.common)
;; - [Drivers](#metabase.driver)
;; - [Permissions](#metabase.models.permissions)
;; - [The Query Processor](#metabase.query-processor)
;; - [Application Settings](#metabase.settings.models.setting)
;;
;; ## Important Libraries
;;
;; - [Toucan 2](https://github.com/camsaul/toucan2/) to work with models
;; - [Honey SQL](https://github.com/seancorfield/honeysql) (version 2) for SQL queries
;; - [Liquibase](https://docs.liquibase.com/concepts/changelogs/changeset.html) for database migrations
;; - [Compojure](https://github.com/weavejester/compojure) on top of [Ring](https://github.com/ring-clojure/ring) for our API
;;
;; ## Other Helpful Things
;;
;; [Tips on our Github wiki](https://github.com/metabase/metabase/wiki/Metabase-Backend-Dev-Secrets)
;;
;; ### The Dev Debug Page
;; If you want an easy way to GET/POST to an endpoint and display the results in a webpage, check out the [Dev Debug
;; Page](https://github.com/metabase/metabase/pull/40580). Cherry-pick the commit from that PR, modify `DevDebug.jsx` as
;; you see fit ([here](https://github.com/metabase/metabase/commit/4c5723f44424dca2a68a753b83e31ec8129da0fb) is an
;; example from the ParseSQL project), and then play with the results at `/dev_debug`. *Don't forget to remove the
;; commit before merging to `master`!*
;;
;; ### Lifecycle of a Query
;; Dan wrote a nice guide [here](https://www.notion.so/metabase/Lifecycle-of-a-query-58e212402b7e444d937aba7757f9ec06?pvs=4)
;;
;; <hr />


(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require
   [clojure.core.async :as a]
   [clojure.core.memoize :as memoize]
   [clojure.main]
   [clojure.string :as str]
   [clojure.test]
   [dev.debug-qp :as debug-qp]
   [dev.explain :as dev.explain]
   [dev.h2 :as dev.h2]
   [dev.malli :as dev.malli]
   [dev.memory :as dev.memory]
   [dev.migrate :as dev.migrate]
   [dev.model-tracking :as model-tracking]
   [dev.render-png :as render-png]
   [hashp.preload :as hashp]
   [honey.sql :as sql]
   [java-time.api :as t]
   [malli.dev :as malli-dev]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.env :as mdb.env]
   [metabase.channel.email :as email]
   [metabase.config.core :as config]
   [metabase.core.core :as mbc]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.server.core :as server]
   [metabase.server.test-handler :as server.test-handler]
   [metabase.settings.core :as setting]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test-runner]
   [metabase.test.data.impl :as data.impl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(comment
  debug-qp/keep-me
  model-tracking/keep-me
  dev.h2/keep-me)

(apply require clojure.main/repl-requires)

;; REPL spy helper; tap> is the point
#_{:clj-kondo/ignore [:discouraged-var :missing-docstring]}
(defn tap>-spy [x]
  (doto x tap>))

(p/import-vars
 [debug-qp
  pprint-sql]
 [dev.explain
  explain-query]
 [dev.malli
  visualize-schema!]
 [dev.migrate
  migrate!
  rollback!
  migration-sql-by-id]
 [dev.memory
  with-memory-logging
  measuring-thread-allocations]
 [render-png
  open-html
  open-png-bytes
  open-hiccup-as-html]
 [model-tracking
  track!
  untrack!
  untrack-all!
  reset-changes!
  changes]
 [mt
  set-ns-log-level!])

(def initialized?
  "Was Metabase already initialized? Used in `init!` to prevent calling `core/init!`
   more than once (during `start!`, for example)."
  (atom nil))

(defn init!
  "Trigger general initialization, but only once."
  []
  (when-not @initialized?
    (mbc/init!)
    (reset! initialized? true)))

(defn migration-timestamp
  "Returns a UTC timestamp in format `yyyy-MM-dd'T'HH:mm:ss` that you can used to postfix for migration ID."
  []
  (t/format (t/formatter "yyyy-MM-dd'T'HH:mm:ss") (t/zoned-date-time (t/zone-id "UTC"))))

(defn deleted-inmem-databases
  "Finds in-memory Databases for which the underlying in-mem h2 db no longer exists."
  []
  (let [h2-dbs (t2/select :model/Database :engine :h2)
        in-memory? (fn [db] (some-> db :details :db (str/starts-with? "mem:")))
        can-connect? (fn [db]
                       (binding [driver.settings/*allow-testing-h2-connections* true]
                         (try
                           (driver/can-connect? :h2 (:details db))
                           (catch org.h2.jdbc.JdbcSQLNonTransientConnectionException _
                             false)
                           (catch Exception e
                             (log/error e "Error checking in-memory database for deletion")
                             ;; we don't want to delete these, so just pretend we could connect
                             true))))]
    (remove can-connect? (filter in-memory? h2-dbs))))

(defn prune-deleted-inmem-databases!
  "Delete any in-memory Databases to which we can't connect (in order to trigger cleanup of their related tasks, which
  will otherwise spam logs)."
  []
  (when-let [outdated-ids (seq (map :id (deleted-inmem-databases)))]
    (t2/delete! :model/Database :id [:in outdated-ids])))

(defn start!
  "Start Metabase"
  []
  (server/start-web-server! (server.test-handler/test-handler))
  (init!)
  (when config/is-dev?
    (prune-deleted-inmem-databases!)
    (with-out-str (malli-dev/start!))))

(defn stop!
  "Stop Metabase"
  []
  (malli-dev/stop!)
  (server/stop-web-server!))

(defn restart!
  "Restart Metabase"
  []
  (stop!)
  (start!))

(comment
  (-> (t2/query-one ["SELECT * FROM report_card WHERE id = 133;"])
      :dimensions
      (cheshire.core/parse-string keyword))

  ;; Original form, before the big PR
  ;;{:cache_invalidated_at nil,
  ;; :description nil,
  ;; :archived false,
  ;; :view_count 1,
  ;; :collection_position 1,
  ;; :source_card_id nil,
  ;; :table_id 2,
  ;; :result_metadata
  ;; "[{\"database_type\":\"INTEGER\",\"semantic_type\":\"type/Quantity\",\"lib/deduplicated-name\":\"count\",\"lib/original-name\":\"count\",\"name\":\"count\",\"lib/source\":\"source/aggregations\",\"lib/source-column-alias\":\"count\",\"source\":\"aggregation\",\"field_ref\":[\"aggregation\",0],\"effective_type\":\"type/Integer\",\"lib/desired-column-alias\":\"count\",\"display_name\":\"Count\",\"fingerprint\":{\"global\":{\"distinct-count\":1,\"nil%\":0.0},\"type\":{\"type/Number\":{\"skewness\":null,\"min\":18760.0,\"q1\":18760.0,\"q3\":18760.0,\"excess-kurtosis\":null,\"zero-fraction\":0.0,\"mode-fraction\":1.0,\"top-3-fraction\":1.0,\"max\":18760.0,\"sd\":0.0,\"avg\":18760.0}}},\"base_type\":\"type/Integer\"}]",
  ;; :embedding_type nil,
  ;; :initially_published_at nil,
  ;; :card_schema 23,
  ;; :database_id 1,
  ;; :metabot_chart_id nil,
  ;; :enable_embedding false,
  ;; :collection_id 9,
  ;; :query_type "query",
  ;; :name "Order Count",
  ;; :document_id nil,
  ;; :last_used_at #t "2026-07-31T20:42:23.193962Z",
  ;; :type "metric",
  ;; :dimensions
  ;; "[{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"semantic-type\":\"type/PK\",\"sources\":[{\"type\":\"field\",\"field-id\":9}],\"name\":\"ID\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/BigInteger\",\"status\":\"status/active\",\"id\":\"491505b4-3a9f-4f24-80ec-2ed248592235\",\"display-name\":\"ID\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"semantic-type\":\"type/FK\",\"sources\":[{\"type\":\"field\",\"field-id\":11}],\"name\":\"USER_ID\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Integer\",\"status\":\"status/active\",\"id\":\"a57ab84e-5aec-4b81-889a-537e50f052fa\",\"display-name\":\"User ID\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"semantic-type\":\"type/FK\",\"sources\":[{\"type\":\"field\",\"field-id\":14}],\"name\":\"PRODUCT_ID\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Integer\",\"status\":\"status/active\",\"id\":\"50dd2dbe-0563-4564-891e-8347506e0ad6\",\"display-name\":\"Product ID\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"sources\":[{\"type\":\"field\",\"field-id\":10,\"binning\":true}],\"name\":\"SUBTOTAL\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"2481429e-4d20-432f-9878-22a1cac70781\",\"display-name\":\"Subtotal\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"sources\":[{\"type\":\"field\",\"field-id\":6,\"binning\":true}],\"name\":\"TAX\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"02a7f81f-c11e-41d3-845e-ea53ad5b1fc8\",\"display-name\":\"Tax\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"sources\":[{\"type\":\"field\",\"field-id\":5,\"binning\":true}],\"name\":\"TOTAL\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"6b57dcf4-59ab-455d-b25c-585736384861\",\"display-name\":\"Total\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"semantic-type\":\"type/Discount\",\"sources\":[{\"type\":\"field\",\"field-id\":3,\"binning\":true}],\"name\":\"DISCOUNT\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"cfebcb0d-841b-41ca-8024-7f5d9e969df9\",\"display-name\":\"Discount\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"semantic-type\":\"type/CreationTimestamp\",\"sources\":[{\"type\":\"field\",\"field-id\":13}],\"name\":\"CREATED_AT\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/DateTime\",\"status\":\"status/active\",\"id\":\"24e09a3d-1146-4a03-9fd5-075993fab011\",\"display-name\":\"Created At\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"accd1376-4eb7-4dea-9060-0ab1bed87535\",\"type\":\"main\",\"display-name\":\"Orders\"},\"semantic-type\":\"type/Quantity\",\"sources\":[{\"type\":\"field\",\"field-id\":2,\"binning\":true}],\"name\":\"QUANTITY\",\"lib/source\":\"source/table-defaults\",\"effective-type\":\"type/Integer\",\"status\":\"status/active\",\"id\":\"6d904d9a-1652-4e1a-9805-914b3a25f1a7\",\"display-name\":\"Quantity\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"semantic-type\":\"type/PK\",\"sources\":[{\"type\":\"field\",\"field-id\":8}],\"name\":\"ID\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/BigInteger\",\"status\":\"status/active\",\"id\":\"d9ef2ded-b007-4a6a-8b75-6e906305eef5\",\"display-name\":\"ID\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"sources\":[{\"type\":\"field\",\"field-id\":15}],\"name\":\"EAN\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"dbf34ef1-31d6-4003-a994-62207a5f3064\",\"display-name\":\"Ean\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"semantic-type\":\"type/Title\",\"sources\":[{\"type\":\"field\",\"field-id\":17}],\"name\":\"TITLE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"d7203661-73fd-454f-a5ef-2cde959f4783\",\"display-name\":\"Title\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"semantic-type\":\"type/Category\",\"sources\":[{\"type\":\"field\",\"field-id\":18}],\"name\":\"CATEGORY\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"9359bb45-f0c6-4eea-99dd-487720a27bfa\",\"display-name\":\"Category\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"semantic-type\":\"type/Company\",\"sources\":[{\"type\":\"field\",\"field-id\":34}],\"name\":\"VENDOR\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"edd2fca2-5c1b-458c-bcb6-3f818651188e\",\"display-name\":\"Vendor\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"sources\":[{\"type\":\"field\",\"field-id\":44,\"binning\":true}],\"name\":\"PRICE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"430c6d45-35a4-4d93-9ca1-d25e1a4f79cb\",\"display-name\":\"Price\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"semantic-type\":\"type/Score\",\"sources\":[{\"type\":\"field\",\"field-id\":16,\"binning\":true}],\"name\":\"RATING\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"02f1743d-687a-43fa-a760-7e28f6edb657\",\"display-name\":\"Rating\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"e3daf736-7600-4c21-a2d5-c873c69602af\",\"type\":\"connection\",\"display-name\":\"Product\"},\"semantic-type\":\"type/CreationTimestamp\",\"sources\":[{\"type\":\"field\",\"field-id\":63}],\"name\":\"CREATED_AT\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/DateTime\",\"status\":\"status/active\",\"id\":\"2115fe83-253b-485a-97f3-f5df7fd068f5\",\"display-name\":\"Created At\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/PK\",\"sources\":[{\"type\":\"field\",\"field-id\":4}],\"name\":\"ID\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/BigInteger\",\"status\":\"status/active\",\"id\":\"87e63f04-61b7-4434-9a09-4123b2c611c8\",\"display-name\":\"ID\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"sources\":[{\"type\":\"field\",\"field-id\":51}],\"name\":\"ADDRESS\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"98ebc977-4868-464d-882f-cdb6f220e75d\",\"display-name\":\"Address\",\"has-field-values\":\"search\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/Email\",\"sources\":[{\"type\":\"field\",\"field-id\":7}],\"name\":\"EMAIL\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"e6361983-eab2-4237-a433-40e0459098b3\",\"display-name\":\"Email\",\"has-field-values\":\"search\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"sources\":[{\"type\":\"field\",\"field-id\":54}],\"name\":\"PASSWORD\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"1a247927-ccf0-4a30-85ca-fea0dc192d88\",\"display-name\":\"Password\",\"has-field-values\":\"search\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/Name\",\"sources\":[{\"type\":\"field\",\"field-id\":48}],\"name\":\"NAME\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"dae20933-b88c-45bf-ad35-73ba55933eb8\",\"display-name\":\"Name\",\"has-field-values\":\"search\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/City\",\"sources\":[{\"type\":\"field\",\"field-id\":53}],\"name\":\"CITY\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"bb984e20-9270-4035-951f-9ecf1fbe7bc1\",\"display-name\":\"City\",\"has-field-values\":\"search\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/Longitude\",\"sources\":[{\"type\":\"field\",\"field-id\":58,\"binning\":true}],\"name\":\"LONGITUDE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"eae230b6-c6fc-49cd-9903-4b0c7068e2d2\",\"display-name\":\"Longitude\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/State\",\"sources\":[{\"type\":\"field\",\"field-id\":1}],\"name\":\"STATE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"08bd7048-2377-4a67-9b20-100ee0a70c16\",\"display-name\":\"State\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/Source\",\"sources\":[{\"type\":\"field\",\"field-id\":30}],\"name\":\"SOURCE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"b040e5a4-3866-4a94-9233-72851689de27\",\"display-name\":\"Source\",\"has-field-values\":\"list\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"sources\":[{\"type\":\"field\",\"field-id\":12}],\"name\":\"BIRTH_DATE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Date\",\"status\":\"status/active\",\"id\":\"19d3ad6c-4fb5-42da-967e-86de36fc3466\",\"display-name\":\"Birth Date\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/ZipCode\",\"sources\":[{\"type\":\"field\",\"field-id\":61}],\"name\":\"ZIP\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Text\",\"status\":\"status/active\",\"id\":\"85f1cd78-5ca4-41a6-81ce-663da0e93215\",\"display-name\":\"Zip\",\"has-field-values\":\"search\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/Latitude\",\"sources\":[{\"type\":\"field\",\"field-id\":52,\"binning\":true}],\"name\":\"LATITUDE\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/Float\",\"status\":\"status/active\",\"id\":\"c78ef732-b741-4587-8071-50193e73c555\",\"display-name\":\"Latitude\",\"has-field-values\":\"none\"},{\"group\":{\"id\":\"1848fdc8-d08d-4724-9081-92564820a5c9\",\"type\":\"connection\",\"display-name\":\"User\"},\"semantic-type\":\"type/CreationTimestamp\",\"sources\":[{\"type\":\"field\",\"field-id\":50}],\"name\":\"CREATED_AT\",\"lib/source\":\"source/implicitly-joinable\",\"effective-type\":\"type/DateTime\",\"status\":\"status/active\",\"id\":\"7f50d456-c21b-43e9-9714-8a947c78a016\",\"display-name\":\"Created At\",\"has-field-values\":\"none\"}]",
  ;; :creator_id 1,
  ;; :updated_at #t "2026-07-31T20:42:24.048248Z",
  ;; :made_public_by_id nil,
  ;; :embedding_params nil,
  ;; :cache_ttl nil,
  ;; :dataset_query
  ;; "{\"lib/type\":\"mbql/query\",\"stages\":[{\"lib/type\":\"mbql.stage/mbql\",\"source-table\":2,\"aggregation\":[[\"count\",{\"lib/uuid\":\"638740d4-5459-44f9-82e5-e2b3ff0e1443\"}]]}],\"database\":1}",
  ;; :dimension_mappings
  ;; "[{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"08402cf4-760a-4ca1-bdc2-83403bb7b2d6\",\"effective-type\":\"type/BigInteger\",\"base-type\":\"type/BigInteger\"},9],\"table-id\":2,\"dimension-id\":\"491505b4-3a9f-4f24-80ec-2ed248592235\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"01d0de91-a388-459d-b4c4-347a221becb1\",\"effective-type\":\"type/Integer\",\"base-type\":\"type/Integer\"},11],\"table-id\":2,\"dimension-id\":\"a57ab84e-5aec-4b81-889a-537e50f052fa\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"0fcb2ec5-a1a4-402e-a079-b4f0505b91e8\",\"effective-type\":\"type/Integer\",\"base-type\":\"type/Integer\"},14],\"table-id\":2,\"dimension-id\":\"50dd2dbe-0563-4564-891e-8347506e0ad6\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"d1eb0bfc-de10-417f-b364-2fe0b1a29420\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\"},10],\"table-id\":2,\"dimension-id\":\"2481429e-4d20-432f-9878-22a1cac70781\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"5c3b65c5-44c3-43c4-aaa4-75ad2fb472cb\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\"},6],\"table-id\":2,\"dimension-id\":\"02a7f81f-c11e-41d3-845e-ea53ad5b1fc8\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"b3f8fd06-e7f3-4b2b-8aa3-455debceaea5\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\"},5],\"table-id\":2,\"dimension-id\":\"6b57dcf4-59ab-455d-b25c-585736384861\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"0aada9d7-fc25-4633-a8f5-042b50b798f0\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\"},3],\"table-id\":2,\"dimension-id\":\"cfebcb0d-841b-41ca-8024-7f5d9e969df9\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"a7f8eac7-439e-437f-81c8-f133f05ba66e\",\"effective-type\":\"type/DateTime\",\"base-type\":\"type/DateTime\"},13],\"table-id\":2,\"dimension-id\":\"24e09a3d-1146-4a03-9fd5-075993fab011\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"a6e69cf0-bc01-4ef8-bf4c-ba4594b5b3f4\",\"effective-type\":\"type/Integer\",\"base-type\":\"type/Integer\"},2],\"table-id\":2,\"dimension-id\":\"6d904d9a-1652-4e1a-9805-914b3a25f1a7\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"e5921f19-e24d-4ec2-a5a3-c9b69492b983\",\"effective-type\":\"type/BigInteger\",\"base-type\":\"type/BigInteger\",\"source-field\":14},8],\"table-id\":3,\"dimension-id\":\"d9ef2ded-b007-4a6a-8b75-6e906305eef5\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"867a09fe-ffa4-48d8-ad18-f19ab61298ad\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":14},15],\"table-id\":3,\"dimension-id\":\"dbf34ef1-31d6-4003-a994-62207a5f3064\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"314cf8a8-643c-4dba-bce0-5f2f364df9f0\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":14},17],\"table-id\":3,\"dimension-id\":\"d7203661-73fd-454f-a5ef-2cde959f4783\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"70c8ea33-a48e-4b1d-a1c0-8218066fa550\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":14},18],\"table-id\":3,\"dimension-id\":\"9359bb45-f0c6-4eea-99dd-487720a27bfa\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"f8517995-efc1-48ee-8c20-e53f909ac676\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":14},34],\"table-id\":3,\"dimension-id\":\"edd2fca2-5c1b-458c-bcb6-3f818651188e\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"3c54f8ed-2aa6-477f-9070-afded7e76c88\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\",\"source-field\":14},44],\"table-id\":3,\"dimension-id\":\"430c6d45-35a4-4d93-9ca1-d25e1a4f79cb\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"cadcc44e-9e71-468b-8e0a-e79b6a4b35fa\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\",\"source-field\":14},16],\"table-id\":3,\"dimension-id\":\"02f1743d-687a-43fa-a760-7e28f6edb657\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"3e1d792a-75c7-4f96-b8f4-4429d8d81b55\",\"effective-type\":\"type/DateTime\",\"base-type\":\"type/DateTime\",\"source-field\":14},63],\"table-id\":3,\"dimension-id\":\"2115fe83-253b-485a-97f3-f5df7fd068f5\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"6914b05a-879c-4914-9efa-c441fc0ede97\",\"effective-type\":\"type/BigInteger\",\"base-type\":\"type/BigInteger\",\"source-field\":11},4],\"table-id\":1,\"dimension-id\":\"87e63f04-61b7-4434-9a09-4123b2c611c8\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"8fcda3c8-37bc-4705-bc5c-e173435410bb\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},51],\"table-id\":1,\"dimension-id\":\"98ebc977-4868-464d-882f-cdb6f220e75d\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"2f358f67-0d3f-4c0a-9988-8b4f8ee1181d\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},7],\"table-id\":1,\"dimension-id\":\"e6361983-eab2-4237-a433-40e0459098b3\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"7296ca18-66b3-4b43-8fb5-c7303c1cadc4\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},54],\"table-id\":1,\"dimension-id\":\"1a247927-ccf0-4a30-85ca-fea0dc192d88\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"46fef353-9888-4728-9fdd-42431f2800e8\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},48],\"table-id\":1,\"dimension-id\":\"dae20933-b88c-45bf-ad35-73ba55933eb8\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"7939e10b-37ab-4823-ad49-9919cbdad724\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},53],\"table-id\":1,\"dimension-id\":\"bb984e20-9270-4035-951f-9ecf1fbe7bc1\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"901f62bb-569d-401b-bef9-fc8e880ff178\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\",\"source-field\":11},58],\"table-id\":1,\"dimension-id\":\"eae230b6-c6fc-49cd-9903-4b0c7068e2d2\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"24d74691-fd25-4d2f-87bc-0bf897160ae8\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},1],\"table-id\":1,\"dimension-id\":\"08bd7048-2377-4a67-9b20-100ee0a70c16\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"425209cc-d57b-4626-8dc3-a6afab314969\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},30],\"table-id\":1,\"dimension-id\":\"b040e5a4-3866-4a94-9233-72851689de27\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"c7cc6f2b-85b1-4612-86db-2cbd4e553429\",\"effective-type\":\"type/Date\",\"base-type\":\"type/Date\",\"source-field\":11},12],\"table-id\":1,\"dimension-id\":\"19d3ad6c-4fb5-42da-967e-86de36fc3466\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"1fe92955-60af-4cd9-88c8-20a4b31db6d5\",\"effective-type\":\"type/Text\",\"base-type\":\"type/Text\",\"source-field\":11},61],\"table-id\":1,\"dimension-id\":\"85f1cd78-5ca4-41a6-81ce-663da0e93215\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"14d458af-32af-4ec0-8541-9fc4c29dd640\",\"effective-type\":\"type/Float\",\"base-type\":\"type/Float\",\"source-field\":11},52],\"table-id\":1,\"dimension-id\":\"c78ef732-b741-4587-8071-50193e73c555\"},{\"type\":\"table\",\"target\":[\"field\",{\"lib/uuid\":\"05c7929a-81b2-4181-ba40-7a58aa2ef2e7\",\"effective-type\":\"type/DateTime\",\"base-type\":\"type/DateTime\",\"source-field\":11},50],\"table-id\":1,\"dimension-id\":\"7f50d456-c21b-43e9-9714-8a947c78a016\"}]",
  ;; :id 133,
  ;; :legacy_query nil,
  ;; :parameter_mappings "[]",
  ;; :dataset_query_metrics_v2_migration_backup nil,
  ;; :metabot_conversation_id nil,
  ;; :display "scalar",
  ;; :archived_directly false,
  ;; :entity_id "Re8cIQW0v59y8wvEsWD0F",
  ;; :collection_preview true,
  ;; :visualization_settings "{}",
  ;; :metabase_version "v1.57.1-SNAPSHOT (391a417)",
  ;; :parameters "[]",
  ;; :dashboard_id nil,
  ;; :created_at #t "2026-07-31T20:42:21.805541Z",
  ;; :public_uuid nil}
  )

(defn ns-unmap-all
  "Unmap all interned vars in a namespace. Reset the namespace to a blank slate! Perfect for when you rename everything
  and want to make sure you didn't miss a reference or when you redefine a multimethod.

    (ns-unmap-all *ns*)"
  ([]
   (ns-unmap-all *ns*))

  ([a-namespace]
   (doseq [[symb] (ns-interns a-namespace)]
     (ns-unmap a-namespace symb))
   (doseq [[symb varr] (ns-refers a-namespace)
           :when (not= (the-ns (:ns (meta varr)))
                       (the-ns 'clojure.core))]
     (ns-unmap a-namespace symb))))

(defn ns-unalias-all
  "Remove all aliases for other namespaces from the current namespace.

    (ns-unalias-all *ns*)"
  ([]
   (ns-unalias-all *ns*))

  ([a-namespace]
   (doseq [[symb] (ns-aliases a-namespace)]
     (ns-unalias a-namespace symb))))

(defmacro require-model
  "Rather than requiring all models in the ns declaration, make it easy to require the ones you need for your current
  session"
  [model-sym]
  `(require [(symbol (str "metabase.models." (quote ~model-sym))) :as (quote ~model-sym)]))

(defmacro with-permissions
  "Execute the body with the given permissions."
  [permissions & body]
  `(binding [api/*current-user-permissions-set* (delay ~permissions)]
     ~@body))

(defn query-jdbc-db
  "Execute a SQL query against a JDBC database. Useful for testing SQL syntax locally.

    (query-jdbc-db :oracle \"SELECT to_date('1970-01-01', 'YYYY-MM-DD') FROM dual\")

    (query-jdbc-db :h2 \"SELECT name FROM people WHERE name LIKE '%Ken%'\")

  `sql-args` can be either a SQL string or a tuple with a SQL string followed by any prepared statement args. By
  default this method uses the same methods to set prepared statement args and read columns from results as used by
  the `:sql-jdbc` Query Processor, but you pass the optional third arg `options`, as `nil` to use the driver's default
  behavior.

  You can query against a dataset other than the default test data DB by passing in a `[driver dataset]` tuple as the
  first arg:

    (dev/query-jdbc-db
     [:sqlserver 'time-test-data]
     [\"SELECT * FROM dbo.users WHERE dbo.users.last_login_time > ?\" (java-time/offset-time \"16:00Z\")])"
  {:arglists '([driver sql]            [[driver dataset] sql]
                                       [driver honeysql-form]  [[driver dataset] honeysql-form]
                                       [driver [sql & params]] [[driver dataset] [sql & params]])}
  [driver-or-driver+dataset sql-args]
  (let [[driver dataset] (u/one-or-many driver-or-driver+dataset)
        [sql & params]   (if (map? sql-args)
                           (sql/format sql-args)
                           (u/one-or-many sql-args))
        canceled-chan    (a/promise-chan)]
    (try
      (driver/with-driver driver
        (letfn [(thunk []
                  (let [db (mt/db)]
                    (sql-jdbc.execute/do-with-connection-with-options
                     driver
                     db
                     {:session-timezone (qp.timezone/report-timezone-id-if-supported driver db)}
                     (fn [conn]
                       (with-open [stmt (sql-jdbc.execute/prepared-statement driver conn sql params)
                                   rs   (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
                         (let [rsmeta (.getMetaData rs)]
                           {:cols (sql-jdbc.execute/column-metadata driver rsmeta)
                            :rows (reduce conj [] (sql-jdbc.execute/reducible-rows driver rs rsmeta canceled-chan))}))))))]
          (if dataset
            (data.impl/do-with-dataset (data.impl/resolve-dataset-definition *ns* dataset) thunk)
            (thunk))))
      (catch InterruptedException e
        (a/>!! canceled-chan :cancel)
        (throw e)))))

(methodical/defmethod t2.connection/do-with-connection :model/Database
  "Support running arbitrary queries against data warehouse DBs for easy REPL debugging. Only works for SQL+JDBC drivers
  right now!

    ;; use Honey SQL
    (t2/query (t2/select-one Database :engine :postgres, :name \"test-data\")
              {:select [:*], :from [:venues]})

    ;; use it with `select`
    (t2/select :conn (t2/select-one Database :engine :postgres, :name \"test-data\")
               \"venues\")

    ;; use it with raw SQL
    (t2/query (t2/select-one Database :engine :postgres, :name \"test-data\")
              \"SELECT * FROM venues;\")

    ;; use it with the Sample Database
    (t2/query (t2/select-one Database :engine :h2, :name \"Sample Database\")
              \"SELECT * FROM people LIMIT 1;\")"
  [database f]
  (t2.connection/do-with-connection (sql-jdbc.conn/db->pooled-connection-spec database) f))

(methodical/defmethod t2.pipeline/build [#_query-type     :default
                                         #_model          :default
                                         #_resolved-query :mbql]
  [_query-type _model _parsed-args resolved-query]
  resolved-query)

(methodical/defmethod t2.pipeline/compile [#_query-type  :default
                                           #_model       :default
                                           #_built-query :mbql]
  "Run arbitrary MBQL queries. Only works for SQL right now!

    ;; Run a query against a Data warehouse DB
    (t2/query (t2/select-one Database :name \"test-data\")
              (mt/mbql-query venues))

    ;; Run MBQL queries against the application database
    (t2/query (dev/with-app-db (mt/mbql-query core_user {:aggregation [[:min [:get-year $date_joined]]]})))
    =>
    [{:min 2023}]"
  [_query-type _model built-query]
  ;; make sure we use the application database when compiling the query and not something goofy like a connection for a
  ;; Data warehouse DB, if we're using this in combination with a Database as connectable
  (let [{:keys [query params]} (binding [t2.connection/*current-connectable* nil]
                                 (qp.compile/compile built-query))]
    (into [query] params)))

(defn- maybe-realize
  "Realize a lazy sequence if it's a lazy sequence. Otherwise, return the value as is."
  [x]
  (if (instance? clojure.lang.LazySeq x)
    (doall x)
    x))

(methodical/defmethod t2.hydrate/hydrate-with-strategy :around ::t2.hydrate/multimethod-simple
  "Throws an error if simple hydrations make DB calls (which is an easy way to accidentally introduce an N+1 bug)."
  [model strategy k instances]
  (if (or config/is-prod?
          (< (count instances) 2))
    (next-method model strategy k instances)
    (do
      ;; prevent things like dereferencing metabase.api.common/*current-user-permissions-set* from triggering the check
      ;; by calling `next-method` *twice*. To reduce the performance impact, just call it with the first instance.
      ;; we do this for each model because e.g. we may have one `:RootCollection` and several `:Collection`s.
      (doseq [[_instance-model instances] (group-by t2/model instances)]
        (maybe-realize (next-method model strategy k [(first instances)])))
      ;; Now we can actually run the hydration with the full set of instances and make sure no more DB calls happened.
      (t2/with-call-count [call-count]
        (let [res (maybe-realize (next-method model strategy k instances))]
          ;; only throws an exception if the simple hydration makes a DB call
          (when (pos-int? (call-count))
            (throw (ex-info (format "N+1 hydration detected!!! Model %s, key %s]" (pr-str model) k)
                            {:model model :strategy strategy :k k :items-count (count instances) :db-calls (call-count)})))
          res)))))

(defn app-db-as-data-warehouse
  "Add the application database as a Database. Currently only works if your app DB uses broken-out details!"
  []
  (binding [t2.connection/*current-connectable* nil]
    (or (t2/select-one :model/Database :name "Application Database")
        (let [details (#'mdb.env/broken-out-details
                       (mdb/db-type)
                       @#'mdb.env/env)
              app-db  (first (t2/insert-returning-instances! :model/Database
                                                             {:name    "Application Database"
                                                              :engine  (mdb/db-type)
                                                              :details details}))]
          (sync/sync-database! app-db)
          app-db))))

(defmacro with-app-db
  "Use the app DB as a `Database` and bind it so [[metabase.test/db]], [[metabase.test/mbql-query]], and the like use
  it."
  [& body]
  `(let [db# (app-db-as-data-warehouse)]
     (mt/with-driver (:engine db#)
       (mt/with-db db#
         ~@body))))

(defmacro p
  "#p, but to use in pipelines like `(-> 1 inc dev/p inc)`.

  See https://github.com/weavejester/hashp"
  [form]
  (hashp/p* form))

;; pipeline tap helper; calling tap> is the point
#_{:clj-kondo/ignore [:discouraged-var]}
(defn tap
  "#tap, but to use in pipelines like `(-> 1 inc dev/tap prn inc)`."
  [form]
  (u/prog1 form
    (tap> <>)))

(defn- tests-in-var-ns [test-var]
  (->> test-var meta :ns ns-interns vals
       (filter (comp :test meta))))

(defn find-root-test-failure!
  "Sometimes tests fail due to another test not cleaning up after itself properly (e.g. leaving permissions in a dirty
  state). This is a common cause of tests failing in CI, or when run via `find-and-run-tests`, but not when run alone.

  This helper allows you to pass in a test var for a test that fails only after other tests run. It finds and runs all
  tests, running your passed test after each.

  When the passed test starts failing, it throws an exception notifying you of the test that caused it to start
  failing. At that point, you can start investigating what pleasant surprises that test is leaving behind in the
  database.

  You can also run it with `clojure -X`:

    clojure -X:dev dev/find-root-test-failure!
     :failing-test-var metabase.users.models.user-parameter-value-test/user-parameter-value-store-test
     :scope :full-suite
     :find-tests-options '{:exclude-tags [:mb/driver-tests] :only [\"test\"] :partition/total 2 :partition/index 1}'"
  ([opts]
   (find-root-test-failure! (requiring-resolve (:failing-test-var opts)) opts))

  ([failing-test-var & {:keys [scope find-tests-options] :or {scope :same-ns, find-tests-options {}}}]
   (let [failed? (fn []
                   (not= [0 0] ((juxt :fail :error) (clojure.test/run-test-var failing-test-var))))]
     (when (failed?)
       (throw (ex-info "Test is already failing! Better go fix it." {:failed-test failing-test-var})))
     (let [tests (case scope
                   :same-ns (tests-in-var-ns failing-test-var)
                   :full-suite (metabase.test-runner/find-tests find-tests-options))]
       (doseq [test tests]
         (clojure.test/run-test-var test)
         (when (failed?)
           (println (u/colorize :red (format "Test failed after running: `%s`" test)))
           (spit (str "test_failure_" (munge test))
                 (format "Test failed after running: `%s`" test))))))))

(defn setup-email!
  "Set up email settings for sending emails from Metabase. This is useful for testing email sending in the REPL."
  [& settings]
  (let [settings (merge {:host     "localhost"
                         :port     1025
                         :user     "metabase"
                         :pass     "metabase@secret"
                         :security :none}
                        settings)]
    (when (::email/error (email/test-smtp-connection settings))
      (throw (ex-info "Failed to connect to SMTP server" {:settings settings})))
    (setting/set-many! (update-keys settings
                                    {:host        :email-smtp-host,
                                     :user        :email-smtp-username,
                                     :pass        :email-smtp-password,
                                     :port        :email-smtp-port,
                                     :security    :email-smtp-security,
                                     :sender-name :email-from-name,
                                     :sender      :email-from-address,
                                     :reply-to    :email-reply-to}))))

(defn seed-instance!
  "Seed an empty instance with test users and test db.
  This is useful for bootstrapping an instance in the REPL."
  []
  ;; seed test users
  (mt/initialize-if-needed! :test-users)
  ;; seed test db
  (mt/id))

(defn reset-static!
  "Reset static and template caches to pick up new js"
  []
  ((requiring-resolve 'stencil.loader/invalidate-cache))
  (memoize/memo-clear! @(requiring-resolve 'metabase.server.routes.index/load-inline-js)))

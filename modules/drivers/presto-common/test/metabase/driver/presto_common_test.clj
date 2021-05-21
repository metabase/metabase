(ns metabase.driver.presto-common-test
    (:require [clj-http.client :as http]
              [clojure.core.async :as a]
              [clojure.string :as str]
              [clojure.test :refer :all]
              [honeysql.core :as hsql]
              [java-time :as t]
              [metabase.db.metadata-queries :as metadata-queries]
              [metabase.driver :as driver]
              [metabase.driver.sql.query-processor :as sql.qp]
              [metabase.driver.util :as driver.u]
              [metabase.models.database :refer [Database]]
              [metabase.models.field :refer [Field]]
              [metabase.models.table :as table :refer [Table]]
              [metabase.query-processor :as qp]
              [metabase.test :as mt]
              [metabase.test.fixtures :as fixtures]
              [metabase.test.util :as tu]
              [metabase.test.util.log :as tu.log]
              [metabase.util :as u]
              [schema.core :as s]
              [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

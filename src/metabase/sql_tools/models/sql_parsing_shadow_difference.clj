(ns metabase.sql-tools.models.sql-parsing-shadow-difference
  "An input on which the two parsers of a shadow SQL parser backend did not agree. See
  [[metabase.sql-tools.shadow-differences]]."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.sql-tools.db :as sql-tools.db]
   [metabase.sql-tools.schema :as sql-tools.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SqlParsingShadowDifference [_model] :sql_parsing_shadow_difference)

(derive :model/SqlParsingShadowDifference :metabase/model)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-shadow-difference! :- :int
  "Insert the shadow difference `row`, returning the number of rows inserted."
  [row :- ::sql-tools.schema/shadow-difference.create]
  (sql-tools.db/insert-shadow-difference! row))

(mu/defn shadow-difference-seen-again! :- :int
  "Count one more sighting of the shadow difference with `input-hash` and keep its newest `changes`, returning the
  number of rows updated."
  [input-hash :- :string
   changes    :- ::sql-tools.schema/shadow-difference.changes]
  (sql-tools.db/shadow-difference-seen-again! input-hash changes))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SqlParsingShadowDifference [_model]
  {:skip? true})

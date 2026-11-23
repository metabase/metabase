(ns metabase.sql-tools.models.sql-parsing-shadow-difference
  "An input on which the two parsers of a shadow SQL parser backend did not agree. See
  [[metabase.sql-tools.shadow-differences]]."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SqlParsingShadowDifference [_model] :sql_parsing_shadow_difference)

(derive :model/SqlParsingShadowDifference :metabase/model)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SqlParsingShadowDifference [_model]
  {:skip? true})

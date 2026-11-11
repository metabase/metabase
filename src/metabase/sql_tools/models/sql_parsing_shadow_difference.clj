(ns metabase.sql-tools.models.sql-parsing-shadow-difference
  "An input on which the two parsers of a shadow SQL parser backend did not agree. See
  [[metabase.sql-tools.shadow-differences]]."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SqlParsingShadowDifference [_model] :sql_parsing_shadow_difference)

(derive :model/SqlParsingShadowDifference :metabase/model)

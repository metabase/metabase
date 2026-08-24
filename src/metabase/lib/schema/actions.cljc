(ns metabase.lib.schema.actions
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; only for Actions. Column name => value. A column name is technically allowed to be blank.
;;;
;;; NOTE: this schema is only referenced from `mu/defn-` `:-` annotations (e.g. `cast-values` in
;;; `metabase.driver.sql-jdbc.actions`), which are compiled out of production builds, so it provides no runtime
;;; protection in prod. The value slot is enforced upstream by `metabase.actions.args/::row` via an explicit
;;; `mr/validate` in `perform-action-v2!`, which does run in prod (that is the gate). Keeping `:any` here
;;; is therefore inert, not a hole; tighten it to match `::actions.args/row` if this is ever moved onto an
;;; always-instrumented path.
(mr/def ::row
  [:map-of
   [:string {:decode/normalize lib.schema.common/normalize-string-key}]
   :any])

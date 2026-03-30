(ns metabase-enterprise.security-center.models.security-advisory
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SecurityAdvisory [_model] :security_advisory)

(doto :model/SecurityAdvisory
  (derive :metabase/model))

(t2/deftransforms :model/SecurityAdvisory
  {:severity     mi/transform-keyword
   :match_status mi/transform-keyword})

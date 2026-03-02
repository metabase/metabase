(ns metabase.apps.models.app
  "`:model/App` - Toucan2 model for the `app` table."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/App [_model] :app)

(doto :model/App
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/App
  {:auth_method mi/transform-keyword})

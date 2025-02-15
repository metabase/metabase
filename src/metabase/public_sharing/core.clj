(ns metabase.public-sharing.core
  (:require
   [metabase.public-sharing.settings :as public-sharing.settings]))

(defn remove-public-uuid-if-public-sharing-is-disabled
  "If public sharing is *disabled* and `object` has a `:public_uuid`, remove it so people don't try to use it (since it
  won't work). Intended for use as part of a `post-select` implementation for Cards and Dashboards."
  [object]
  (if (and (:public_uuid object)
           (not (public-sharing.settings/enable-public-sharing)))
    (assoc object :public_uuid nil)
    object))

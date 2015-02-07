(ns metabase.api.user
  (:require [metabase.api.common :refer :all]
            [metabase.models.hydrate :refer [hydrate]]))

(defapi current [_]
  (or-404-> (*current-user*)
    (hydrate [:org_perms :organization])))

(ns metabase-enterprise.metabot-v3.tools.test-util
  (:require
   [metabase.lib.core :as lib]))

(defn query=
  "Compare two queries for equality, ignoring lib/uuids."
  [expected actual]
  (= (lib/remove-lib-uuids expected)
     (lib/remove-lib-uuids actual)))

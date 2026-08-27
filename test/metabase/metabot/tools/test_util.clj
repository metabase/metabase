(ns metabase.metabot.tools.test-util
  (:require
   [metabase.lib.core :as lib]))

(defn query=
  "Compare two queries for equality, ignoring lib/uuids."
  [expected actual]
  (= (lib/remove-lib-uuids expected)
     (lib/remove-lib-uuids actual)))

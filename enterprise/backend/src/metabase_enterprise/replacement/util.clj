(ns metabase-enterprise.replacement.util
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn valid-query? :- :boolean
  "Returns true if `maybe-query` has at least one stage.

  This is used to skip fully broken queries in the app db."
  [maybe-query :- [:maybe [:or ::lib.schema/query [:map {:closed true}]]]]
  (some? (seq (:stages maybe-query))))

(ns metabase.lib.page
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn current-page :- [:maybe ::lib.schema/page]
  "Return the `:page` in a query stage."
  ([query]
   (current-page query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (:page (lib.util/query-stage query stage-number))))

(mu/defn with-page :- ::lib.schema/query
  "Set or remove the `:page` in a query stage."
  ([query page]
   (with-page query -1 page))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    page         :- [:maybe ::lib.schema/page]]
   (lib.util/update-query-stage query stage-number (fn [stage]
                                                     (if page
                                                       (-> stage
                                                           (dissoc :limit) ; drop `:limit` if present since it conflicts with `:page`
                                                           (assoc :page page))
                                                       (dissoc stage :page))))))

(ns metabase.query-processor.normalize
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.util.malli :as mu]))

(defn- query-type [query]
  (keyword (some (fn [k]
                   (get query k))
                 [:lib/type
                  "lib/type"
                  :type
                  "type"])))

(mu/defn normalize
  ;; database ID has to be resolved before normalizing stuff; see [[metabase.query-processor.setup]]
  [query :- [:map [:database ::lib.schema.id/database]]]
  (case (query-type query)
    :mbql/query
    (lib.normalize/normalize query)

    (:native :query)
    (-> query
        mbql.normalize/normalize
        lib.convert/->pMBQL)

    :else
    (throw (ex-info "Invalid query: unknown type"
                    {:query query}))))

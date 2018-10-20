;TODO refactor (assoc nested?, attach-params)
(ns metabase.query-processor.middleware.superquery
  (:require [metabase.query-processor.interface :as i]))

(defn- limit
  [max-results source-query]
  { :limit (or max-results
               i/absolute-max-results)
    :source-query source-query})

(defn- native-to-source
  [maybe-native-query]
  (if-let [native (:query maybe-native-query)]
    (-> maybe-native-query
        (#(assoc % :native native))
        (#(dissoc % :query :params)))
    maybe-native-query))

(defn- expand-superquery*
  [{{:keys [max-results]} :constraints, :as query}]
  (if-let [super-query (:super-query query)]
    (let [type  (keyword (:type query))
          sub-query (get query type)
          source-query (native-to-source sub-query)
          limited-source-query (limit max-results source-query)
          new-query (assoc super-query :source-query limited-source-query)]
      (-> query
          (#(dissoc % :native :super-query :parameters))
          (#(assoc % :query new-query :type :query :nested? true))
          (#(assoc-in % [:info :query-type] "MBQL"))
          (#(assoc-in % [:info :nested?] true))
          (#(if-let [params (:params sub-query)]
             (assoc % :params params)
             %))))
    query))

(defn- attach-params* [query]
  (if (contains? query :params) (assoc-in (dissoc query :params) [:native :params] (:params query)) query))

(defn expand-superquery [qp]
  "Return the query built from original query and super-query"
  (comp qp expand-superquery*))

(defn attach-params [qp]
  "Attach parameters"
  (comp qp attach-params*))

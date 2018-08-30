(ns metabase.query-processor.middleware.superquery
  (:require             [clojure.tools.logging :as log])
  (:require             [clojure.data :as data])
  )

(defn native-to-source
  [maybe-native-query]
  (if-let [native (:query maybe-native-query)]
    (-> maybe-native-query
        (#(assoc % :native native))
        (#(dissoc % :query :params)))
    maybe-native-query))

(defn- expand-superquery*
  [query]
  (if-let [super-query (:super-query query)]
    (let [type  (keyword (:type query))
          sub-query (type query)
          source-query (native-to-source sub-query)
          new-query (assoc super-query :source-query source-query)]
      (-> query
          (#(dissoc % :native :super-query :parameters))
          (#(assoc % :query new-query :type :query :nested? true))
          (#(assoc-in % [:info :query-type] :MBQL))
          (#(assoc-in % [:info :nested?] true))
          (#(if-let [params (:params sub-query)]
             (assoc % :params params)
             %))))
    query))

(defn- attach-params* [query]
  (if (contains? query :params) (assoc-in (dissoc query :params) [:native :params] (:params query)) query))

(defn expand-superquery [qp]
  (comp qp expand-superquery*))

(defn attach-params [qp]
  (comp qp attach-params*))

(ns metabase.api-routes.request-schemas-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.api-routes.core]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.request-schemas :as request-schemas]
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

(def ^:private pinned-open-maps
  "Every `{:closed false}` map a request can reach, named by the last registry key that leads to it and the path from
  there, or by its endpoint when no registry key does."
  '#{[:metabase.lib.schema.common/open-json 5]
     [:metabase.lib.schema.visualization/click-behavior]
     [:metabase.lib.schema.visualization/click-behavior.parameter-mapping 1 0]
     [:metabase.lib.schema.visualization/click-behavior.parameter-ref]
     [:metabase.lib.schema.visualization/column-settings.entry]
     [:metabase.lib.schema.visualization/link-card]
     [:metabase.lib.schema.visualization/link-card :entity 0]
     [:metabase.lib.schema.visualization/pivot-table.collapsed-rows]
     [:metabase.lib.schema.visualization/pivot-table.column-split]
     [:metabase.lib.schema.visualization/scalar.segment]
     [:metabase.lib.schema.visualization/series-order.entry]
     [:metabase.lib.schema.visualization/table.column]
     [:metabase.lib.schema.visualization/table.column-formatting-rule]
     [:metabase.lib.schema.visualization/visualization-settings]
     [:metabase.users.schema/user.settings]
     [:metabase.util.malli.schema/json-value :object]
     [metabase-enterprise.database-routing.api :post "/destination-database" :body :destinations 0 :details]
     [metabase.analytics.api.metaplow-proxy :post "/send" :body]
     [metabase.analytics.api.metaplow-proxy :post "/send" :body :payload]
     [metabase.query-processor.api :post "/:export-format" :body :visualization_settings]
     [metabase.warehouses-rest.api :post "/" :body :details]
     [metabase.warehouses-rest.api :post "/validate" :body :details :details]
     [metabase.warehouses-rest.api :put "/:id" :body :admin_details 0]
     [metabase.warehouses-rest.api :put "/:id" :body :details 0]
     [metabase.warehouses-rest.api :put "/:id" :body :settings 0]
     [metabase.warehouses-rest.api :put "/:id" :body :write_data_details 0]})

(defn- open-map-id [endpoint trail]
  (if-let [i (last (keep-indexed (fn [i k]
                                   (when (and (qualified-keyword? k) (not= k ::mc/default))
                                     i))
                                 trail))]
    (subvec trail i)
    (into endpoint trail)))

(defn- reachable-open-maps []
  (into #{}
        (for [nmspace          (all-ns)
              [_ {:keys [form]}] (api.macros/ns-routes nmspace)
              param            [:route :query :body :request]
              :let             [schema (get-in form [:params param :schema])]
              :when            schema
              finding          (request-schemas/findings schema)
              :when            (= (:kind finding) :open-map)]
          (open-map-id [(ns-name nmspace) (:method form) (get-in form [:route :path]) param]
                       (:trail finding)))))

(deftest reachable-open-maps-are-pinned-test
  (when config/ee-available?
    (require 'metabase-enterprise.api-routes.routes))
  (let [reachable (reachable-open-maps)]
    (testing "an open map lets a client send keys no schema declares: declare the keys, or key the map by strings"
      (is (= #{} (set/difference reachable pinned-open-maps))))
    (when config/ee-available?
      (testing "an open map no request reaches any more comes off the list"
        (is (= #{} (set/difference pinned-open-maps reachable)))))))

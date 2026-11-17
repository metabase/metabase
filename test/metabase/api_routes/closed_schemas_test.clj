(ns metabase.api-routes.closed-schemas-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.api-routes.core]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.closed-schemas :as closed-schemas]
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

(def ^:private pinned-open-maps
  "The registry key of every `{:closed false}` map a request can reach."
  #{:metabase-enterprise.action-v2.api/api-action-expression
    :metabase.agent-api.schema/query-object
    :metabase.analytics.api.metaplow-proxy/track-envelope
    :metabase.analytics.api.metaplow-proxy/track-payload
    :metabase.channel.schema/bug-report.object
    :metabase.comments.schema/prose-mirror-node.attrs
    :metabase.documents.prose-mirror/node.attrs
    :metabase.embedding.schema/embedding-theme.settings
    :metabase.lib.schema.common/open-json.object
    :metabase.lib.schema.visualization/click-behavior
    :metabase.lib.schema.visualization/click-behavior.parameter-mapping.entry
    :metabase.lib.schema.visualization/click-behavior.parameter-ref
    :metabase.lib.schema.visualization/column-settings.entry
    :metabase.lib.schema.visualization/link-card
    :metabase.lib.schema.visualization/link-card.entity
    :metabase.lib.schema.visualization/pivot-table.collapsed-rows
    :metabase.lib.schema.visualization/pivot-table.column-split
    :metabase.lib.schema.visualization/scalar.segment
    :metabase.lib.schema.visualization/series-order.entry
    :metabase.lib.schema.visualization/table.column
    :metabase.lib.schema.visualization/table.column-formatting-rule
    :metabase.lib.schema.visualization/visualization-settings
    :metabase.metabot.schema/references
    :metabase.metabot.schema/row-value.object
    :metabase.search.schema/weights.overrides
    :metabase.settings.schema/setting-value.object
    :metabase.testing-api.api/echo.body
    :metabase.testing-api.api/query-spec
    :metabase.user-key-value.schema/value.object
    :metabase.users.schema/user.settings
    :metabase.util.malli/value.object
    :metabase.warehouse-schema-rest.api.table/csv-upload.parts
    :metabase.warehouses.schema/database.connection-details
    :metabase.warehouses.schema/database.local-settings})

(defn- endpoint-request-schemas []
  (for [nmspace            (all-ns)
        [_ {:keys [form]}] (api.macros/ns-routes nmspace)
        param              [:route :query :body :request]
        :let               [schema (get-in form [:params param :schema])]
        :when              schema]
    {:endpoint [(ns-name nmspace) (:method form) (get-in form [:route :path]) param]
     :schema   schema}))

(defn- reachable-open-maps
  "The open maps a request can reach, as the registry key of each, or the endpoint and trail of one that has none."
  []
  (into #{}
        (for [{:keys [endpoint schema]} (endpoint-request-schemas)
              {:keys [kind trail]}      (closed-schemas/findings schema)
              :when                     (= kind :open-map)
              :let                      [registry-key (peek trail)]]
          (if (and (qualified-keyword? registry-key) (not= registry-key ::mc/default))
            registry-key
            (into endpoint trail)))))

(deftest reachable-open-maps-are-pinned-test
  (when config/ee-available?
    (require 'metabase-enterprise.api-routes.routes))
  (let [reachable (reachable-open-maps)]
    (testing "an open map is a registry schema of its own, so it is pinned by name"
      (is (= #{} (into #{} (remove keyword?) reachable))))
    (testing "an open map lets a client send keys no schema declares: declare the keys, or key the map by strings"
      (is (= #{} (set/difference (into #{} (filter keyword?) reachable) pinned-open-maps))))
    (when config/ee-available?
      (testing "an open map no request reaches any more comes off the list"
        (is (= #{} (set/difference pinned-open-maps reachable)))))))

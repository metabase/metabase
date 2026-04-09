(ns metabase.permissions-rest.schema
  (:require
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli.registry :as mr]))

(defn- kw-int->int-decoder [kw-int]
  (if (int? kw-int)
    kw-int
    (parse-long (name kw-int))))

(mr/def ::decodable-keyword-int
  "Integer malli schema that knows how to decode itself from the :123 sort of shape used in perm-graphs"
  [:int {:decode/perm-graph kw-int->int-decoder}])

(mr/def ::id       ::decodable-keyword-int)
(mr/def ::group-id ::decodable-keyword-int)

(mr/def ::native
  "native permissions"
  [:maybe [:enum :write :none :full :limited]])

(mr/def ::perms
  "Perms that get reused for TablePerms and SchemaPerms"
  [:enum
   :all
   :blocked
   :full
   :legacy-no-self-service
   :limited
   :no
   :none
   :query-builder
   :sandboxed
   :segmented
   :unrestricted])

(mr/def ::table-perms
  [:or
   [:ref ::perms]
   [:map
    [:read  {:optional true} [:enum :all :none]]
    [:query {:optional true} [:enum :all :none :segmented]]]])

(mr/def ::schema-perms
  [:or
   [:ref ::perms]
   [:map-of [:ref ::id] [:ref ::table-perms]]])

(mr/def ::schema-graph
  [:map-of
   [:string {:decode/perm-graph name}]
   [:ref ::schema-perms]])

(mr/def ::schemas
  [:or
   [:enum
    :all
    :segmented
    :none
    :block
    :blocked
    :full
    :limited
    :impersonated
    :unrestricted
    :sandboxed
    :legacy-no-self-service
    :query-builder-and-native
    :query-builder
    :no]
   [:ref ::schema-graph]])

(mr/def ::data-perms
  [:map
   [:native  {:optional true} [:ref ::native]]
   [:schemas {:optional true} [:ref ::schemas]]])

(mr/def ::strict-data-perms
  "Data perms that care about how view-data and make-queries are related to one another.
  If you have write access for native queries, you must have data access to all schemas."
  [:and
   [:ref ::data-perms]
   [:fn {:error/fn (fn [_ _] (trs "Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."))}
    (fn [{:keys [native schemas]}]
      (not (and (= native :write) schemas (not (#{:all :impersonated} schemas)))))]])

(mr/def ::strict-db-graph
  "like db-graph, but with added validations:
   - Ensures 'view-data' is not 'blocked' if 'create-queries' is 'query-builder-and-native'."
  [:map-of
   [:ref ::id]
   [:and
    [:map
     [:view-data      {:optional true} [:ref ::schemas]]
     [:create-queries {:optional true} [:ref ::schemas]]
     [:data           {:optional true} [:ref ::strict-data-perms]]
     [:download       {:optional true} [:ref ::strict-data-perms]]
     [:data-model     {:optional true} [:ref ::strict-data-perms]]
     [:details        {:optional true} [:enum :yes :no]]
     [:transforms     {:optional true} [:enum :yes :no]]]
    [:fn {:error/fn (fn [_ _] (trs "Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."))}
     (fn [db-entry]
       (let [{:keys [create-queries view-data]} db-entry]
         (not (and (= create-queries :query-builder-and-native) (= view-data :blocked)))))]]])

(mr/def ::data-permissions-graph
  "Used to transform, and verify data permissions graph"
  [:map
   [:groups [:map-of [:ref ::group-id] [:maybe [:ref ::strict-db-graph]]]]])

(mr/def ::strict-api-permissions-graph
  "Top level strict data graph schema expected over the API. Includes revision ID for avoiding concurrent updates."
  [:map
   [:revision {:optional true} [:maybe int?]]
   [:force    {:optional true} [:maybe boolean?]]
   [:groups   [:map-of [:ref ::group-id] [:maybe [:ref ::strict-db-graph]]]]])

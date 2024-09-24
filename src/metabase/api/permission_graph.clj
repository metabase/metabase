(ns metabase.api.permission-graph
  "Convert the permission graph's naive json conversion into the correct types.

  The strategy here is to use s/conform to tag every value that needs to be converted with the conversion strategy,
  then postwalk to actually perform the conversion."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.walk :as walk]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defmulti ^:private convert
  "convert values from the naively converted json to what we REALLY WANT"
  first)

(defmethod convert :kw->int [[_ k]] (Integer/parseInt (name k)))
(defmethod convert :str->kw [[_ s]] (keyword s))

;; Convert a keyword to string without excluding the namespace.
;; e.g: :schema/name => "schema/name".
;; Primarily used for schema-name since schema are allowed to have "/"
;; and calling (name s) returning a substring after "/".
(defmethod convert :kw->str [[_ s]] (u/qualified-name s))
(defmethod convert :nil->none [[_ _]] :none)
(defmethod convert :identity [[_ x]] x)
(defmethod convert :global-execute [[_ x]] x)
(defmethod convert :db-exeute [[_ x]] x)

;;; --------------------------------------------------- Common ----------------------------------------------------

(defn- kw-int->int-decoder [kw-int]
  (if (int? kw-int)
    kw-int
    (parse-long (name kw-int))))

(def DecodableKwInt
  "Integer malli schema that knows how to decode itself from the :123 sort of shape used in perm-graphs"
  [:int {:decode/perm-graph kw-int->int-decoder}])

(def ^:private Id DecodableKwInt)
(def ^:private GroupId DecodableKwInt)

;; ids come in as keywordized numbers
(s/def ::id (s/with-gen (s/or :kw->int (s/and keyword? #(re-find #"^\d+$" (name %))))
              #(gen/fmap (comp keyword str) (s/gen pos-int?))))

(def ^:private Native
  "native permissions"
  [:maybe [:enum :write :none :full :limited]])

;;; ------------------------------------------------ Data Permissions ------------------------------------------------

(def ^:private Perms
  "Perms that get reused for TablePerms and SchemaPerms"
  [:enum
   :all :segmented :none :full :limited :unrestricted :legacy-no-self-service :sandboxed :query-builder-and-native :query-builder :no :blocked])

(def ^:private TablePerms
  [:or Perms [:map
              [:read {:optional true} [:enum :all :none]]
              [:query {:optional true} [:enum :all :none :segmented]]]])

(def ^:private SchemaPerms
  [:or Perms [:map-of Id TablePerms]])

(def ^:private SchemaGraph
  [:map-of
   [:string {:decode/perm-graph name}]
   SchemaPerms])

(def ^:private Schemas
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
   SchemaGraph])

(def ^:private DataPerms
  [:map
   [:native {:optional true} Native]
   [:schemas {:optional true} Schemas]])

(def DbGraph
  "Permission graph for a single group"
  [:map-of
   Id
   [:and
    [:map
     [:view-data {:optional true} Schemas]
     [:create-queries {:optional true} Schemas]
     [:data {:optional true} DataPerms]
     [:download {:optional true} DataPerms]
     [:data-model {:optional true} DataPerms]
     [:details {:optional true} [:enum :yes :no]]]]])

(def DataPermissionsGraph
  "Used to transform, and verify data permissions graph"
  [:map
   [:groups [:map-of GroupId [:maybe DbGraph]]]])

(def ApiDataPermissionsGraphph
  "Top level strict data graph schema expected over the API. Includes revision ID for avoiding concurrent updates."
  [:map
   [:groups [:map-of GroupId [:maybe DbGraph]]]
   [:revision int?]])

;;; --------------------------------------------- Execution Permissions ----------------------------------------------

(s/def ::execute (s/or :str->kw #{"all" "none"}))

(s/def ::execute-graph
  (s/or :global-execute ::execute
        :db-exeute      (s/map-of ::id ::execute
                                  :conform-keys true)))

(s/def :metabase.api.permission-graph.execution/groups
  (s/map-of ::id
            ::execute-graph
            :conform-keys true))

(s/def ::execution-permissions-graph
  (s/keys :req-un [:metabase.api.permission-graph.execution/groups]))

(defn converted-json->graph
  "The permissions graph is received as JSON. That JSON is naively converted. This performs a further conversion to
  convert graph keys and values to the types we want to work with."
  [spec kwj]
  (->> (s/conform spec kwj)
       (walk/postwalk (fn [x]
                        (if (and (vector? x) (get-method convert (first x)))
                          (convert x)
                          x)))))

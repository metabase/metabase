(ns metabase.api.permission-graph
  "Convert the permission graph's naive json conversion into the correct types.

  The strategy here is to use s/conform to tag every value that needs to be converted with the conversion strategy,
  then postwalk to actually perform the conversion."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]))

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

(def DecodableKwInt
  "Integer malli schema that knows how to decode itself from the :123 sort of shape used in perm-graphs"
  [:int {:decode/perm-graph
         (fn kw-int->int-decoder [kw-int]
           (if (int? kw-int)
             kw-int
             (Integer/parseInt (name kw-int))))}])

(def ^:private Id DecodableKwInt)

;; ids come in as keywordized numbers
(s/def ::id (s/with-gen (s/or :kw->int (s/and keyword? #(re-find #"^\d+$" (name %))))
              #(gen/fmap (comp keyword str) (s/gen pos-int?))))

(def ^:private Native
  "native permissions"
  [:maybe [:enum :write :none :full :limited]])

;;; ------------------------------------------------ Data Permissions ------------------------------------------------

(def ^:private TablePerms
  [:or
   [:enum :all :segmented :none :full :limited]
   [:map
    [:read {:optional true} [:enum :all :none]]
    [:query {:optional true} [:enum :all :none :segmented]]]])

(def ^:private SchemaPerms
  [:or
   [:keyword {:title "schema name"}]
   [:map-of Id TablePerms]])

(def ^:private SchemaGraph
  [:map-of
   [:string {:decode/perm-graph name}]
   SchemaPerms])

(def ^:private Schemas
  [:or
   [:enum :all :segmented :none :block :full :limited]
   SchemaGraph])

(def ^:private DataPerms
  [:map
   [:native {:optional true} Native]
   [:schemas {:optional true} Schemas]])

(def StrictDataPerms
  "data perms that care about how native and schemas keys related to one another.
  If you have write access for native queries, you must have data access to all schemas."
  [:and
   DataPerms
   [:fn {:error/fn (fn [_ _] (trs "Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."))}
    (fn [{:keys [native schemas]}]
      (not (and (= native :write) schemas (not= schemas :all))))]])

(def ^:private DbGraph
  [:schema {:registry {"data-perms" DataPerms}}
   [:map-of
    Id
    [:map
     [:data {:optional true} "data-perms"]
     [:query {:optional true} "data-perms"]
     [:download {:optional true} "data-perms"]
     [:data-model {:optional true} "data-perms"]
     ;; We use :yes and :no instead of booleans for consistency with the application perms graph, and
     ;; consistency with the language used on the frontend.
     [:details {:optional true} [:enum :yes :no]]
     [:execute {:optional true} [:enum :all :none]]]]])

(def StrictDbGraph
  "like db-graph, but if you have write access for native queries, you must have data access to all schemas."
  [:schema {:registry {"strict-data-perms" StrictDataPerms}}
   [:map-of
    Id
    [:map
     [:data {:optional true} "strict-data-perms"]
     [:query {:optional true} "strict-data-perms"]
     [:download {:optional true} "strict-data-perms"]
     [:data-model {:optional true} "strict-data-perms"]
     ;; We use :yes and :no instead of booleans for consistency with the application perms graph, and
     ;; consistency with the language used on the frontend.
     [:details {:optional true} [:enum :yes :no]]
     [:execute {:optional true} [:enum :all :none]]]]])

(def data-permissions-graph
  "Used to transform, and verify data permissions graph"
  [:map [:groups [:map-of Id DbGraph]]])

(def strict-data
  "Top level strict data graph schema"
  [:map
   [:groups [:map-of Id StrictDbGraph]]
   [:revision int?]])

;;; --------------------------------------------- Collection Permissions ---------------------------------------------

(s/def ::collections
  (s/map-of (s/or :identity ::id
                  :str->kw  #{"root"})
            (s/or :str->kw #{"read" "write" "none"})))

(s/def ::collection-graph
  (s/map-of ::id ::collections))

(s/def :metabase.api.permission-graph.collection/groups
  (s/map-of ::id
            ::collection-graph
            :conform-keys true))

(s/def ::collection-permissions-graph
  (s/keys :req-un [:metabase.api.permission-graph.collection/groups]))

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

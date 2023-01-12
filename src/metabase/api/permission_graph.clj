(ns metabase.api.permission-graph
  "Convert the permission graph's naive json conversion into the correct types.

  The strategy here is to use s/conform to tag every value that needs to be converted with the conversion strategy,
  then postwalk to actually perform the conversion."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.spec.gen.alpha :as gen]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me] ;; umd/describe
   [malli.generator :as mg]
   [malli.transform :as mtx]
   [metabase.util :as u]))

(defmulti ^:private convert
  "convert values from the naively converted json to what we REALLY WANT"
  first)

(defmethod convert :kw->int
  [[_ k]]
  (Integer/parseInt (name k)))

(defmethod convert :str->kw
  [[_ s]]
  (keyword s))

;; Convert a keyword to string without excluding the namespace.
;; e.g: :schema/name => "schema/name".
;; Primarily used for schema-name since schema are allowed to have "/"
;; and calling (name s) returning a substring after "/".
(defmethod convert :kw->str
  [[_ s]]
  (u/qualified-name s))

(defmethod convert :nil->none
  [[_ _]]
  :none)

(defmethod convert :identity
  [[_ x]]
  x)

(defmethod convert :global-execute
  [[_ x]]
  x)

(defmethod convert :db-exeute
  [[_ x]]
  x)

;;; --------------------------------------------------- Common ----------------------------------------------------

(defn perm-graph-enum [& keywords]
  ;; temporary hack until the next version of malli comes, when we can drop the
  ;; [:and :keyword ,,,] piece
  [:and {:decode/perm-graph (fn [x] (keyword x))}
   :keyword
   (into [:enum] keywords)])

(mc/decode [:enum :all :none] "all" (mtx/string-transformer))

(def decodable-kw-int
  [:int {:comment "integer schema that knows how to decode itself from the :123 sort of shape used in perm-graphs"
         :decode/perm-graph
         (fn thing [kw-int] (if (int? kw-int) kw-int (Integer/parseInt (name kw-int))))}])

(def id decodable-kw-int)

;; ids come in asa keywordized numbers
(s/def ::id (s/with-gen (s/or :kw->int (s/and keyword? #(re-find #"^\d+$" (name %))))
              #(gen/fmap (comp keyword str) (s/gen pos-int?))))

(def native [:maybe [:enum :write :none :full :limited]])
(s/def ::native (s/or :str->kw #{"write"
                                 ;; data
                                 ;; ""
                                 ;; download
                                 "none" "full" "limited"}
                      :nil->none nil?))

;;; ------------------------------------------------ Data Permissions ------------------------------------------------


(def ^:private table-perms
  [:or
   [:enum :all :segmented :none :full :limited]
   [:map
    [:read [:enum :all :none]]
    [:query [:enum :all :none :segmented]]]])

(def ^:private schema-perms
  [:or
   [:keyword {:title "schema name"}]
   [:map-of id table-perms]])

(def ^:private schema-graph
  [:map-of
   [:string {:decode/perm-graph name}]
   schema-perms])

(def ^:private schemas
  [:or
   [:enum :all :segmented :none :block :full :limited]
   schema-graph])

(def ^:private data-perms
  [:map
   [:native {:optional true} native]
   [:schemas {:optional true} schemas]])

(def ^:private db-graph
  [:map-of
   id
   [:map
    [:data {:optional true} data-perms]
    [:download {:optional true} data-perms]
    [:data-model {:optional true} data-perms]
    ;; "We use :yes and :no instead of booleans for consistency with the application perms graph, and"
    ;; "consistency with the language used on the frontend."
    [:details {:optional true} [:enum :yes :no]]
    [:execute {:optional true} [:enum :all :none]]]])

(def ^:private permission-graph-data-groups
  [:map-of id db-graph])

(def data-permissions-graph
  "Used to transform, and verify data permissions graph"
  [:map [:groups permission-graph-data-groups]])

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

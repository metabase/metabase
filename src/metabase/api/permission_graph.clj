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


(require '[malli.core :as mc] ;; nocommit
         '[malli.error :as me]
         '[malli.util :as mut]
         '[metabase.util.malli :as mu]
         '[metabase.util.malli.describe :as umd] ;; umd/describe
         '[malli.provider :as mp]
         '[malli.generator :as mg]
         '[malli.transform :as mtx])

(defmacro chk [& body] `(print (if (do ~@body) "✅" "❌")))


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
(chk (= 1
        (mc/decode decodable-kw-int :1 (mtx/transformer {:name :perm-graph}))))

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

(def schema-name [:string {:decode/perm-graph name}])
(s/def ::schema-name (s/or :kw->str keyword?))
(chk (= "lemon" (mc/decode schema-name :lemon (mtx/transformer {:name :perm-graph}))))

;; {:groups {1 {:data {:schemas {"PUBLIC" ::schema-perms-granular}}}}} =>
;; {:groups {1 {:data {:schemas {"PUBLIC" {1 :all}}}}}}
(s/def ::read (s/or :str->kw #{"all" "none"}))
(s/def ::query (s/or :str->kw #{"all" "none" "segmented"}))

(def query [:enum :all :none :segmented])
(def read [:enum :all :none])
(def table-perms-granular [:map
                           [:read read]
                           [:query query]])
(s/def ::table-perms-granular (s/keys :opt-un [::read ::query]))

(def table-perms [:or
                  [:enum :all :segmented :none :full :limited]
                  table-perms-granular])
(s/def ::table-perms (s/or :str->kw #{"all" "segmented" "none" "full" "limited"}
                           :identity ::table-perms-granular))

(def table-graph [:map-of id table-perms])
(s/def ::table-graph (s/map-of ::id ::table-perms
                               :conform-keys true))

(def schema-perms [:or [:keyword {:title "schema name"}]
                   table-graph])
(s/def ::schema-perms (s/or :str->kw #{"all" "segmented" "none" "full" "limited"}
                            :identity ::table-graph))

(def schema-graph [:map-of schema-name schema-perms])
(s/def ::schema-graph (s/map-of ::schema-name ::schema-perms
                                :conform-keys true))

(mg/generate schema-graph)

(def schemas [:or
              schema-graph
              [:enum :all :segmented :none :block :full :limited]])

{"PUBLIC" {1 :all}}

(chk (mc/validate schema-graph {"PUBLIC"
                                ;; table-id -> permission level
                                {1 :all}}))

(s/def ::schemas (s/or :str->kw   #{"all" "segmented" "none" "block" "full" "limited"}
                       :nil->none nil?
                       :identity  ::schema-graph))

(s/def ::data (s/keys :opt-un [::native ::schemas]))
(s/def ::download (s/keys :opt-un [::native ::schemas]))
(s/def ::data-model (s/keys :opt-un [::native ::schemas]))

(def details [:enum {:comment
                     (str/join ["We use :yes and :no instead of booleans for consistency with the application perms graph, and"
                                "consistency with the language used on the frontend."])}
              :yes :no])
;; We use "yes" and "no" instead of booleans for consistency with the application perms graph, and consistency with the
;; language used on the frontend.
(s/def ::details (s/or :str->kw #{"yes" "no"}))

(def flamingo [:map
               [:native {:optional true} native]
               [:schemas {:optional true} schemas]])

(def db-perms [:map
               [:data {:optional true} flamingo]
               [:download {:optional true} flamingo]
               [:data-model {:optional true} flamingo]
               [:details {:optional true} details]
               [:execute {:optional true} [:enum :all :none]]])

(s/def ::db-perms (s/keys :opt-un [::data ::download ::data-model ::details ::execute]))

(def db-graph [:map-of id db-perms])
(s/def ::db-graph
  (s/map-of ::id
            ::db-perms
            :conform-keys true))

(def permission-graph-data-groups [:map-of id db-graph])
(s/def :metabase.api.permission-graph.data/groups
  (s/map-of ::id ::db-graph
            :conform-keys true))

(def data-permissions-graph [:map [:groups permission-graph-data-groups]])
(s/def ::data-permissions-graph
  (s/keys :req-un [:metabase.api.permission-graph.data/groups]))

;;; --------------------------------------------- Collection Permissions ---------------------------------------------

(s/def ::collections
  (s/map-of (s/or :identity ::id
                  :str->kw  #{"root"})
            (s/or :str->kw #{"read" "write" "none"})))

(s/def ::collection-graph
  (s/map-of ::id ::collections))

(s/def :metabase.api.permission-graph.collection/groups
  (s/map-of ::id ::collection-graph
            :conform-keys true))

(s/def ::collection-permissions-graph
  (s/keys :req-un [:metabase.api.permission-graph.collection/groups]))

;;; --------------------------------------------- Execution Permissions ----------------------------------------------

(def execute [:enum :all :none])
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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^{:arglists '([data-permissions-graph])} data-permissions-graph-decoder
  (mc/decoder data-permissions-graph
              (mtx/transformer
               mtx/string-transformer
               (mtx/transformer {:name :perm-graph}))))


(for [[_ in out] examples]
  (do
    (chk (mc/validate data-permissions-graph out)
         #_(if
               :validated
             {:out out
              :h (me/humanize (mc/explain data-permissions-graph out)
                              {:wrap #(select-keys % [:message :value])})
              :e (mc/explain data-permissions-graph out)}))
    (chk (= out (data-permissions-graph-decoder in)))
    (if (= out (data-permissions-graph-decoder in)) :ok
        [out (data-permissions-graph-decoder in)])))



;; outputs match [[s]]


;; native data access is :write or :none
;; non-native data access is :all :segmented or :none

;; Download:
;; native download access is :full or :limited or :none
;; non native download :full or :limited or :none

(ns metabase.api.permission-graph
  "Tools for converting the permission graph's naive json conversion into the correct types"
  (:require [clojure.spec.alpha :as s]
            [clojure.spec.gen.alpha :as gen]
            [clojure.walk :as walk]))

(defmulti convert first)

(defmethod convert :kw->int
  [[_ k]]
  (Integer/parseInt (name k)))

(defmethod convert :str->kw
  [[_ s]]
  (keyword s))

(defmethod convert :kw->str
  [[_ s]]
  (name s))

(defmethod convert :nil->none
  [[_ _]]
  :none)

(defmethod convert :identity
  [[_ x]]
  x)

(s/def ::revision pos-int?)

;; ids can be represented as nums or kws
;; TODO create generator s/with-gen
(s/def ::id (s/with-gen (s/or :kw->int (s/and keyword? #(re-find #"^\d+$" (name %))))
              #(gen/fmap (comp keyword str) (s/gen pos-int?))))
(s/def ::native (s/or :str->kw #{"write" "none"}
                      :nil->none nil?))

(s/def ::schema-name (s/or :kw->str keyword?))

(s/def ::schema-perm-granular (s/map-of ::id (s/or :str->kw #{"all" "segmented" "none"})
                                        :conform-keys true))

(s/def ::schema-perms (s/or :str->kw #{"all" "none"}
                            :identity ::schema-perm-granular))

;; {:groups {1 {:schemas {"PUBLIC" ::schema-perms}}}}
(s/def ::schema-graph (s/map-of ::schema-name ::schema-perms
                                :conform-keys true))

;; {:groups {1 {:schemas ::schemas}}}
(s/def ::schemas (s/or :str->kw   #{"all" "none"}
                       :nil->none nil?
                       :identity  ::schema-graph))

;; TODO how to enforce that missing key should be :none? a conformer?
(s/def ::db-perms (s/keys :opt-un [::native ::schemas]))

(s/def ::db-graph (s/map-of ::id ::db-perms
                            :conform-keys true))


(s/def :metabase.api.permission-graph.data/groups
  (s/map-of ::id ::db-graph
            :conform-keys true))

(s/def ::data-permissions-graph
  (s/keys :req-un [:metabase.api.permission-graph.data/groups]))


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

(defn keywordized-json->graph
  [spec kwj]
  (->> (s/conform spec kwj)
       (walk/postwalk (fn [x]
                        (if (and (vector? x) (get-method convert (first x)))
                          (convert x)
                          x)))))

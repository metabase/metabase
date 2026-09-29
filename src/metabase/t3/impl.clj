(ns metabase.t3.impl
  (:require [clojure.edn :as edn]
            [clojure.set :as set]
            [clojure.string :as str]
            [metabase.util.malli :as mu]
            [potemkin.utils :as pu]
            [tech.v3.io :as io])
  (:import (java.io PushbackReader)))

(def RequireSchema
  [:sequential {:min 1} simple-symbol?])

(def JoinCondition
  [:or
   [:tuple [:enum :=] simple-symbol? simple-symbol?]])

(def UserPermissions
  [:map {:closed true}
   [:select {:optional true}
    [:map {:closed true}
     [:condition {:optional true}
      JoinCondition]
     [:columns {:optional true}
      [:sequential simple-symbol?]]]]
   [:update {:optional true}
    [:map {:closed true}
     [:condition {:optional true}
      JoinCondition]
     [:columns {:optional true}
      [:sequential simple-symbol?]]]]])

(def TableSpec
  [:map {:closed true}
   [:columns [:vector simple-symbol?]]
   [:relationships {:optional true}
    [:map-of simple-keyword? [:map {:closed true}
                              [:table simple-keyword?]
                              [:cardinality
                               [:enum :0-N :0-1]]
                              [:join-on [:tuple keyword? simple-symbol? simple-symbol?]]]]]
   [:permissions {:optional true} [:map-of [:enum :user] UserPermissions]]
   [:model {:optional true} keyword?]])

(mu/defn- load-table-spec :- TableSpec
  [table :- simple-keyword?]
  (with-open [reader (PushbackReader.
                      (io/reader
                       (io/resource (str "metabase/t3/tables/" (name table) ".edn"))))]
    (edn/read reader)))

(def ^:private tables
  [:core_user
   :core_session
   :auth_identity])

(def ^:private table-spec
  (into {}
        (map (fn [table]
               [table (load-table-spec table)]))
        tables))

(defn- spec->attributes-schema
  [table-name]
  [:map {:closed true}
   [:where {:optional true}
    [:schema [:ref (keyword (name table-name) "where-expression")]]]
   [:cardinality {:optional true} [:enum :0-1 :0-N]]])

(defn- spec->selection-schema
  [table-name spec]
  (let [{:keys [relationships columns]} spec]
    [:or [:schema [:ref (keyword (name table-name) "column")]]]))

(defn- spec->column-schema
  [table-name spec]
  (vec (cons :enum (map keyword (:columns spec)))))

(defn- gen-expressions
  [table-name]
  [[(keyword (name table-name) "equals-expression")
    [:tuple
     [:enum :=]
     [:or [:schema [:ref (keyword (name table-name) "column")]]
      [:schema [:ref ::table-name]]]
     [:or [:schema [:ref (keyword (name table-name) "column")]]
      [:schema [:ref ::table-name]]]]]
   [(keyword (name table-name) "where-expression")
    [:or [:schema [:ref (keyword (name table-name) "equals-expression")]]]]])

(defn table-spec->schema
  [table-spec]
  [:schema
   {:registry (merge
               (into {::table-name (vec (cons :enum (keys table-spec)))}
                     (comp
                      (map (fn [[table-name spec]]
                             (concat
                              [[(keyword (name table-name) "attributes")
                                (spec->attributes-schema table-name)]
                               [(keyword (name table-name) "selection")
                                (spec->selection-schema table-name spec)]
                               [(keyword (name table-name) "column")
                                (spec->column-schema table-name spec)]]
                              (gen-expressions table-name))))
                      (mapcat identity))
                     table-spec))}
   (vec
    (cons :or
          (for [[table-name _] table-spec]
            [:catn [:table-name [:enum table-name]]
             [:attributes [:? [:schema [:ref (keyword (name table-name) "attributes")]]]]
             [:selection  [:vector {:min 1}
                           [:schema [:ref (keyword (name table-name) "selection")]]]]])))])

(def ^:private eof (Object.))

(mu/defn- load-query-edns
  [namespace :- simple-symbol?
   query-names :- [:sequential simple-symbol?]]
  (let [query-names-set (set query-names)
        edn-file-name   (str (str/replace namespace "." "/") ".edn")
        resource        (io/resource edn-file-name)]
    (when-not resource
      (throw (RuntimeException. (str "Cannot locate " edn-file-name))))
    (with-open [reader (PushbackReader. (io/reader resource))]
      (loop [queries {}]
        (let [next-edn (edn/read {:eof eof} reader)]
          (if (= eof next-edn)
            (do
              (when (not= (set (keys queries))
                          query-names-set)
                (throw (RuntimeException. (str
                                           "Missing definitions for "
                                           (str/join "," (set/difference query-names-set
                                                                         (set (keys queries))))))))
              queries)
            (let [query-name (:name (meta next-edn))]
              (when (queries query-name)
                (throw (RuntimeException. "Duplicate definitions for " query-name)))
              (if (query-names-set query-name)
                (recur (assoc queries query-name next-edn))
                (recur queries)))))))))

(mu/defn require-queries
  [& requires :- [:sequential RequireSchema]]
  (pu/doit [require requires]
           (let [[namespace & query-names] require]
             (let [query-edns (load-query-edns namespace query-names)
                   compiled-queries (update-vals query-edns identity)]
               (first (vals compiled-queries))))))

(comment
  (java.net.URLConnection/setDefaultUseCaches "file" false)
  (java.net.URLConnection/setDefaultUseCaches "jar" false))

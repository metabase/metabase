(ns metabase-enterprise.representations.lookup
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn lookup-by-id [rep-type id]
  (t2/select-one-fn :id (v0-common/type->model rep-type) :id id))





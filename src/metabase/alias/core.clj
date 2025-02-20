(ns metabase.alias.core
  (:require
   [clojure.string :as str]
   [toucan2.core :as t2]))

(defn draft? [alias] (boolean (some-> alias (str/ends-with? "@draft"))))

(defn old? [alias] (str/ends-with? alias "@old"))

(defn root? [alias] (not (str/includes? alias "@")))

(defn stem [alias] (str/replace alias #"@.*" ""))

(defn parent-for-draft
  [draft-alias]
  (assert (draft? draft-alias) "Not a draft alias")
  (let [root-alias (-> draft-alias stem)]
    (t2/select-one :model/Dashboard :alias root-alias)))

(defn- organize-versions
  [dashboards]
  (-> (group-by (comp stem :alias) dashboards)
      (update-vals (fn [dashes] (sort-by :id dashes)))))

(defn versions-for-dashboards
  "Find all versions for any dashboards. Returns a map of alias -> versions"
  [dashboards]
  (let [aliased  (into #{} (keep :alias) dashboards)
        versions (when (seq aliased)
                   (t2/select [:model/Dashboard :id :name :alias]
                              {:where (into [:or]
                                            (for [alias aliased]
                                              [:> [:strpos :alias alias] 0]))}))]
    (->> versions
         (remove (comp root? :alias))
         (map #(assoc % :model "dashboard"))
         organize-versions)))

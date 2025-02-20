(ns metabase.alias.core
  (:require
   [clojure.string :as str]
   [toucan2.core :as t2]))

(defn draft? [alias] (boolean (some-> alias (str/ends-with? "@draft"))))

(defn old? [alias] (boolean (some-> alias (str/ends-with? "@old"))))

(defn root? [alias] (and (string? alias) (not (str/includes? alias "@"))))

(defn stem [alias] (str/replace alias #"@.*" ""))

(defn make-draft-alias [a]
  (assert (string? a) "No alias!")
  (-> a stem (str "@draft")))

(defn make-old-alias [a]
  (assert (string? a) "No alias!")
  (-> a stem (str "@old")))

(defn parent-for-draft
  [promotable-alias]
  (assert ((some-fn draft? old?) promotable-alias) "Not a draft or old alias")
  (let [root-alias (-> promotable-alias stem)]
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

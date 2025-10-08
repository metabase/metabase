(ns metabase.localization.models.localization-test
  (:require
   [clojure.data :as data]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is]]
   [metabase.localization.models.localization :as localization]
   [metabase.util.date-2 :as u.date]
   [metabase.util.yaml :as yaml]))

(def table->model
  {:report_dashboard :model/Dashboard
   :report_card :model/Card
   :collection :model/Collection})

(defn strings-requiring-translation
  []
  (->> (edn/read-string {:readers {'t u.date/parse}}
                        (slurp "resources/sample-content.edn"))
       (mapcat (fn [[k vs]] (map (fn [v] [k v]) vs)))
       (filter (fn [[_k v]] (:should_localize v)))
       (mapcat (fn [[k v]]
                 (let [model (table->model k)]
                   (vals (select-keys v (localization/localizable-fields model))))))
       (filter some?)
       (into #{})))

(defn sample-content-translations []
  (->> (yaml/from-file (io/resource "unsafe-translations.yml"))
       (mapcat (fn [{:keys [file messages]}]
                 (map (fn [message] message) messages)))
       (into #{})))

(deftest all-sample-content-strings-are-marked-unsafe
  (let [[only-required
         _only-translated
         _in-both]
        (data/diff (strings-requiring-translation)
                   (sample-content-translations))]
    (is (nil? only-required))))

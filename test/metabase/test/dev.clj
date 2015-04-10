(ns metabase.test.dev
  (:require [clojure.java.classpath :as classpath]
            [clojure.pprint :refer [pprint]]
            [clojure.string :as s]
            [clojure.tools.namespace.find :as ns-find]
            [metabase.test-data :refer :all]))

(defn api-endpoints-list []
  (->> (ns-find/find-namespaces (classpath/classpath))
       (filter #(re-find #"^metabase\.api\..+(?<!-test)$" (name %)))
       (map (fn [ns-symb]
              (require ns-symb)
              ns-symb))
       (mapcat ns-publics)
       (map second)
       (map meta)
       (filter :is-endpoint?)
       (map (fn [{namesp :ns nm :name}]
              (let [[_ method endpoint] (re-matches #"^([A-Z]+)_(.*)$" (name nm))
                    namesp (s/replace (.getName namesp) #"^metabase\.api\." "")]
                (list (-> (s/lower-case method)
                          keyword)
                      (-> (format "%s/%s" namesp endpoint)
                          (s/replace #"[\._]" "/"))))))
       (group-by first)
       (map (fn [[method endpoints]]
              (list method (-> (map second endpoints)
                               sort))))))

(defn make-api-call [method endpoint]
  ((user->client :rasta) method endpoint))

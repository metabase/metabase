(ns metabase.util.query-params
  (:require [clojure.string :as str]
            [ring.util.codec :as codec]))

(defn- ->searchpart
  "Parses <searchpart> from `url`. see: https://www.rfc-editor.org/rfc/rfc1738#section-3.3a"
  [url]
  (if (str/includes? url "?")
    (let [[_ base-url searchpart] (re-find #"^(.*)\?(.*)$" url)]
      (when (and base-url searchpart)
        [base-url
         (into {}
               (map (fn [[k v]]
                      [(keyword (codec/url-decode k))
                       (if (coll? v) (mapv codec/url-decode v) (codec/url-decode v))])
                    (codec/form-decode searchpart)))]))
    [url {}]))

(defn assoc-qp
  "Takes and returns a string represnting a url. The original string may have qp already.
  `new-qps` is a mapping of keyword->string represented by a map like {:a 1} or {:a [1 2]}"
  [url new-qps]
  (let [[base-url original-qps] (->searchpart url)
        qps (merge-with #(conj [%1] %2) original-qps new-qps)
        new-url (str base-url (when (seq qps) "?"))]
    (reduce
     (fn [url [qp-k qp-v]]
       (let [url-key (codec/url-encode (name qp-k))]
         (str url
              (when (not= url new-url) "&")
              (if (coll? qp-v)
                (str/join "&"
                          (for [v qp-v]
                            (str url-key "=" (codec/url-encode v))))
                (str url-key "=" (codec/url-encode qp-v))))))
     new-url
     ;; sort qps to keep equality stable:
     (sort qps))))


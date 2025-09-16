(ns metabase.util.field-ref
  "Utilities for encoding and decoding field refs for URL usage."
  (:require
   #?(:clj [metabase.util.json :as json])
   [clojure.string :as str]
   [metabase.util.malli :as mu])
  #?(:cljs (:require [goog.crypt.base64 :as base64])))

(mu/defn encode-field-ref-for-url :- :string
  "Encode a field ref as URL-safe base64 to avoid issues with special characters in URL paths."
  [field-ref :- [:sequential :any]]
  (let [json-str #?(:clj  (json/encode field-ref)
                    :cljs (js/JSON.stringify (clj->js field-ref)))
        base64-str #?(:clj  (.encodeToString (java.util.Base64/getEncoder)
                                             (.getBytes ^String json-str "UTF-8"))
                      :cljs (base64/encodeString json-str))]
    (-> base64-str
        (str/replace "+" "-")
        (str/replace "/" "_")
        (str/replace #"=+$" ""))))

(mu/defn decode-field-ref-from-url :- [:sequential :any]
  "Decode a base64-encoded field ref parameter."
  [field-ref-str :- :string]
  (let [base64-str (-> field-ref-str
                       (str/replace "-" "+")
                       (str/replace "_" "/")
                       ;; Add padding if needed
                       (as-> s (let [padding (mod (- 4 (mod (count s) 4)) 4)]
                                 (if (zero? padding)
                                   s
                                   (str s (apply str (repeat padding "=")))))))
        json-str #?(:clj  (String. (.decode (java.util.Base64/getDecoder) base64-str) "UTF-8")
                    :cljs (base64/decodeString base64-str))]
    (vec #?(:clj  (json/decode+kw json-str)
            :cljs (js->clj (js/JSON.parse json-str) :keywordize-keys true)))))

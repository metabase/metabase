(ns metabase.tiles.util
  "Utility functions for tile API endpoints."
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json])
  (:import
   (java.util Base64)))

(defn decode-field-ref
  "Decode a base64-encoded field ref parameter.
  Frontend encodes field refs as URL-safe base64 to avoid issues with special characters in URL paths."
  [field-ref-str]
  (let [base64-str (-> field-ref-str
                       (str/replace "-" "+")
                       (str/replace "_" "/")
                       ;; Add padding if needed
                       (as-> s (let [padding (mod (- 4 (mod (count s) 4)) 4)]
                                 (if (zero? padding) s (str s (str/join (repeat padding "=")))))))
        decoded-bytes (.decode (Base64/getDecoder) base64-str)]
    (json/decode+kw (String. decoded-bytes "UTF-8"))))

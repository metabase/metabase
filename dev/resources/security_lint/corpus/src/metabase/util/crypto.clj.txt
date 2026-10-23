(ns metabase.util.crypto
  "Security-lint test example: crypto misuse that does not depend on taint."
  (:import (java.security MessageDigest) (javax.crypto Cipher) (javax.net.ssl SSLContext)))

(defn weak-digest [] (MessageDigest/getInstance "MD5"))
(defn weak-cipher [] (Cipher/getInstance "AES/ECB/PKCS5Padding"))
(defn weak-tls [] (SSLContext/getInstance "TLSv1"))
(def creds {:user "svc" :password "Corr3ct-Horse-Battery"})

(ns release.common.hash
  (:require
   [clojure.java.io :as io]
   [metabuild-common.core :as u])
  (:import
   (org.apache.commons.codec.digest DigestUtils)))

(set! *warn-on-reflection* true)

(defn sha-256-sum
  "Get the SHA-256 digest of the filename."
  [filename]
  (with-open [is (io/input-stream (u/assert-file-exists filename))]
    (DigestUtils/sha256Hex is)))

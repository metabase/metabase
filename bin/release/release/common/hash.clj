(ns release.common.hash
  (:require [clojure.java.io :as io]
            [metabuild-common.core :as u])
  (:import org.apache.commons.codec.digest.DigestUtils))

(defn sha-256-sum [filename]
  (with-open [is (io/input-stream (u/assert-file-exists filename))]
    (DigestUtils/sha256Hex is)))

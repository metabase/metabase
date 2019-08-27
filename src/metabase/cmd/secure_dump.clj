(ns metabase.cmd.secure-dump
  (:require [clojure.java.io :as io]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.s3 :as s3]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.cmd.up :as up]
            [metabase.cmd.down :as down])
  (:import (java.util.zip ZipEntry ZipOutputStream ZipInputStream)
           (java.net URL)
           (java.io ByteArrayOutputStream)))


(defn up! [s3-upload-url-str curr-db-conn-str]
  (up/up! s3-upload-url-str curr-db-conn-str))

(defn down! [h2-dump-path s3-bucket s3-key secret-key]
  (down/down! h2-dump-path s3-bucket s3-key secret-key))

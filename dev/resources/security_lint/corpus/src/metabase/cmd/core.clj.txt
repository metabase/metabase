(ns metabase.cmd.core
  "Security-lint test example: a command-line entry point."
  (:require [clojure.java.io :as io])
  (:import (java.security MessageDigest)))

(defn ^:command load-from [path]
  (MessageDigest/getInstance "MD5")
  (slurp (io/file path)))

(ns metabuild-common.env
  (:require [clojure.string :as str]
            [environ.core :as env]))

(defn env-or-throw
  "Fetch an env var value or throw an Exception if it is unset."
  [k]
  (or (get env/env k)
      (throw (Exception. (format "%s is unset. Please set it and try again."
                                 (str/upper-case (str/replace (name k) #"-" "_")))))))

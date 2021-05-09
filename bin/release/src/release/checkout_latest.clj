(ns release.checkout-latest
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(defn checkout-latest! []
  (u/step (format "Checkout latest code for %s" (c/branch))
    (u/sh {:dir u/project-root-directory} "git" "pull")))

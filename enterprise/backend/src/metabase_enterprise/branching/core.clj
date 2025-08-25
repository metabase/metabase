(ns metabase-enterprise.branching.core
  "Handles the logic for setting the current branch from an HTTP request and supports
  overriding t2/select to get branch-able models based on the current request."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise get-current-branch
  "Get the current branch from the X-Metabase-Branch header."
  :feature :none
  [request]
  (prn "HERE" (:headers request))
  (or (get-in request [:headers "X-Metabase-Branch"])
      (get-in request [:headers "x-metabase-branch"])))

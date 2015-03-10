(ns metabase.models.org-test
  (:require [clojure.tools.logging :as log]
            [metabase.test-utils :refer [setup-test-db]]
            [metabase.db :refer :all]
            [metabase.models.org :refer [Org]]
            [korma.core :refer :all]
            [expectations :refer :all]))


;(defn count-orgs []
;  (get-in (first (select Org (aggregate (count :*) :cnt))) [:cnt]))
;
;
;; start with 0 entries
;(expect 0 (count-orgs))
;
;; insert a new value
;(expect (more->
;          false nil?
;          true (contains? :id))
;  (ins Org
;    :name "org_test"
;    :slug "org_test"
;    :inherits false))
;
;; now we should have 1 entry
;(expect 1 (count-orgs))
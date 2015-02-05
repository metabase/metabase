(ns metabase.models.org-test
  (:require [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [metabase.config :refer [app-defaults]]
            [metabase.models.org :refer [Org]]
            [korma.core :refer :all]
            [midje.sweet :refer :all]))


(defn count-orgs []
  (get-in (first (select Org (aggregate (count :*) :cnt))) [:cnt]))


(facts "about Org model"
  (with-state-changes [(before :facts (migrate :up))
                       (after :facts (migrate :down))]
    (fact "starts with 0 entries"
      (count-orgs) => 0)
    (fact "can insert new entries"
      (let [result (insert Org (values {:name "org_test"
                                        :slug "org_test"
                                        :inherits false}))]
        (nil? result) => false
        (println "orgId" (or (:generated_key result) ((keyword "scope_identity()") result) -1))
        (> (or (:generated_key result) ((keyword "scope_identity()") result) -1) 0) => true)
      (count-orgs) => 1)
    ))

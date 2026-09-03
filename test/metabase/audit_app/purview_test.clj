(ns metabase.audit-app.purview-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.audit-app.purview :as purview]))

(def ^:private app-db-doc "docs/installation-and-operation/configuring-application-database.md")

(defn- documented-grant-view-names
  "View names appearing in the `GRANT SELECT ON` statement in [[app-db-doc]]. The docs tell operators which views to
  grant the audit-read role; that list and [[purview/audit-view-names]] are one decision written twice, so this
  extracts the documented one to compare."
  []
  (let [doc (slurp (io/file app-db-doc))
        [_ granted] (re-find #"(?s)GRANT SELECT ON\s+(.*?)\s+TO metabase_audit_read;" doc)]
    (when granted
      (into #{} (map str/trim) (str/split granted #",\s*")))))

(deftest documented-grants-match-purview-test
  (testing (str "the GRANT SELECT list in " app-db-doc " covers exactly the audit purview")
    (is (= purview/audit-view-names
           (documented-grant-view-names)))))

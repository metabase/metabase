(ns metabase.cmd.endpoint-dox.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.endpoint-dox.metadata :as metadata]
   [metabase.config :as config]))

(deftest ^:parallel capitalize-initialisms-test
  (testing "Select initialisms and acronyms are in all caps."
    (is (= "The GeoJSON has too many semicolons."
           (#'metadata/capitalize-initialisms "The Geojson has too many semicolons.")))))

(deftest ^:parallel ns-symbol->page-name-test
  (are [ns-symb expected] (= expected
                             (#'metadata/ns-symbol->page-name ns-symb))
    'metabase.api.table                    "Table"
    'metabase-enterprise.sandbox.api.table "Sandbox table"
    'metabase-enterprise.sandbox.api.gtap  "Sandbox GTAP"
    'metabase-enterprise.serialization.api "Serialization"
    'metabase.api.sso-stuff                "SSO stuff"
    'metabase-enterprise.sso.api.sso       "SSO"))

(deftest ^:parallel include-ee-test
  (testing "Enterprise API endpoints should be included (#22396)"
    (when config/ee-available?
      (is (some (fn [page]
                    ;; this is just a random EE endpoint namespace; if it gets moved or removed just pick a different
                    ;; namespace here I guess
                  (when (= (the-ns 'metabase-enterprise.advanced-permissions.api.application)
                           (:ns page))
                    page))
                (#'metadata/all-pages))))))

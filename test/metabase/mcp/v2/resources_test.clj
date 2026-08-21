(ns metabase.mcp.v2.resources-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.resources :as v2.resources]
   ;; Loaded for its projection registrations: the catalog resource's content is built from
   ;; whatever the loaded tool namespaces have registered.
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(comment tools.content/keep-me)

(deftest ^:parallel fields-catalog-is-listed-test
  (testing "the fields catalog appears in resources/list for a token holding agent:resource:read"
    (let [entry (->> (:resources (v2.resources/list-resources #{"agent:resource:read"}))
                     (some #(when (= (:uri %) v2.resources/fields-catalog-uri) %)))]
      (is (some? entry))
      (is (= "application/json" (:mimeType entry)))
      (testing "a data resource carries no MCP Apps _meta.ui block"
        (is (not (contains? entry :_meta))))))
  (testing "the always-granted wildcard covers it too"
    (is (some #(= (:uri %) v2.resources/fields-catalog-uri)
              (:resources (v2.resources/list-resources #{"agent:resource:*"})))))
  (testing "a token without the scope neither lists nor reads it"
    (is (not (some #(= (:uri %) v2.resources/fields-catalog-uri)
                   (:resources (v2.resources/list-resources #{"agent:content:read"})))))
    (is (= :scope-denied (:status (v2.resources/read-resource v2.resources/fields-catalog-uri
                                                              #{"agent:content:read"} {}))))))

(deftest ^:parallel fields-catalog-read-test
  (testing "reading the catalog returns type -> dot-paths JSON built from the projection registry,
            so the paths get_content's `fields` validates against are the ones published here"
    (let [result  (v2.resources/read-resource v2.resources/fields-catalog-uri
                                              #{"agent:resource:read"} {})
          content (first (:contents result))
          catalog (json/decode (:text content))]
      (is (= :ok (:status result)))
      (is (= "application/json" (:mimeType content)))
      (testing "types registered centrally and by tool namespaces are both present"
        (is (contains? catalog "dashboard"))
        (is (contains? catalog "metric")))
      (testing "values are the dot-path vectors, nested paths included"
        (is (some #{"id"} (get catalog "dashboard")))
        (is (some #(str/starts-with? % "dashcards.") (get catalog "dashboard")))))))

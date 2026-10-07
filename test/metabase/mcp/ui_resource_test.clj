(ns metabase.mcp.ui-resource-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private embed-mcp-template-path "frontend_client/embed-mcp.html")

(deftest built-template-embeds-no-credential-test
  (testing (str "GHY-4543: the built embed-mcp template must render no credential into the shell. MCP Apps UI shell "
                "reads are no longer gated on a scope; what makes serving one to any token holder safe is that the "
                "production template discards the credential it is handed (since #81041) and the iframe fetches its "
                "own through `refresh_ui_credential`. This asserts that inner assumption. The test fallback template "
                "deliberately does embed the credential, so this renders the built one, outside `with-fallback-template`.")
    ;; CI's backend-only runs have no frontend build, so there is nothing to check there — skip rather than fail.
    (if (io/resource embed-mcp-template-path)
      (let [credential "ghy-4543-credential-must-not-be-embedded"
            html       (mcp.ui-resource/render-embed-mcp-template
                        {:instanceUrl    (json/encode "http://localhost:3000")
                         :instanceUrlRaw "http://localhost:3000"
                         :uiCredential   (json/encode credential)
                         :mcpSessionId   (json/encode "ghy-4543-session")})]
        (is (not (str/includes? html credential))
            "the built template rendered the credential into the shell")
        (is (not (str/includes? html "uiCredential"))
            "the built template has a credential placeholder again"))
      (log/infof "Skipping built-template-embeds-no-credential-test: %s is not on the classpath (no frontend build)"
                 embed-mcp-template-path))))

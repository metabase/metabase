(ns metabase-enterprise.metabot-v3.tools
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-metric]
   [metabase-enterprise.metabot-v3.tools.generate-insights]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.invite-user]
   [metabase-enterprise.metabot-v3.tools.who-is-your-favorite]
   [metabase.config :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (java.nio.file Files OpenOption Path)))

(set! *warn-on-reflection* true)

(mu/defn- reducible-tool-metadata-file-paths :- (lib.schema.common/instance-of-class clojure.lang.IReduceInit)
  []
  (reify
    clojure.lang.IReduceInit
    (reduce [_this rf init]
      (u.files/with-open-path-to-resource [path "metabase_enterprise/metabot_v3/tools"]
        (reduce rf
                init
                (eduction
                 (filter #(str/ends-with? (str %) ".json"))
                 (iterator-seq (.iterator (java.nio.file.Files/list path)))))))))

(defmulti ^:private read-tool-metadata
  "Read tool metadata from a `place`... can be a tool keyword name, filename (string), or `Path`."
  {:arglists '([place])}
  class)

(defn- decode-tool-metadata [metadata]
  (mc/decode ::metabot-v3.tools.interface/metadata
             metadata
             (mtx/transformer
              (mtx/json-transformer)
              (mtx/default-value-transformer)
              {:name :metadata-file})))

(mu/defmethod read-tool-metadata Path :- ::metabot-v3.tools.interface/metadata
  [^Path path :- (lib.schema.common/instance-of-class Path)]
  (try
    (with-open [is (Files/newInputStream path (u/varargs OpenOption))
                r  (java.io.InputStreamReader. is)]
      (u/prog1 (decode-tool-metadata (json/decode r true))
        (let [expected-filename (format "%s.json" (name (:name <>)))
              actual-filename   (str (.getFileName path))]
          (assert (= expected-filename actual-filename)
                  (format "Tool filename should match tool name. Expected: '%s', got: '%s'" expected-filename actual-filename)))))
    (catch Throwable e
      (throw (ex-info (i18n/tru "Error reading tool metadata from file {0}: {1}"
                                (str path)
                                (ex-message e))
                      {:path (str path)}
                      e)))))

;;; These methods are mainly for REPL convenience
(defmethod read-tool-metadata :default
  [filename]
  (u.files/with-open-path-to-resource [path filename]
    (read-tool-metadata path)))

(defmethod read-tool-metadata clojure.lang.Keyword
  [tool-name]
  (read-tool-metadata (format "metabase_enterprise/metabot_v3/tools/%s.json" (name tool-name))))

(mu/defn- tools-metadata* :- [:sequential ::metabot-v3.tools.interface/metadata]
  []
  (into []
        (map read-tool-metadata)
        (reducible-tool-metadata-file-paths)))

(def ^{:arglists '([])} ^:dynamic *tools-metadata*
  "Get metadata about the available tools. Metadata matches the `::metabot-v3.tools.interface/metadata` schema.

  In prod model, tools metadata is only loaded once, the first time this function is called, and cached afterwards. In
  dev mode, it is reloaded every time so we can pick up changes to tools."
  (if config/is-prod?
    (let [metadata (delay (tools-metadata*))]
      (fn []
        @metadata))
    tools-metadata*))

(defn applicable-tools
  "Given a list of tools and the relevant context, return the filtered list of tools that are applicable in this
  context."
  [tools context]
  (filter #(metabot-v3.tools.interface/*tool-applicable?* (:name %) context) tools))

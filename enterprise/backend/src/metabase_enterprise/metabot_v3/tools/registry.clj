(ns metabase-enterprise.metabot-v3.tools.registry
  (:require
   [cheshire.core :as json]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu])
  (:import
   (java.nio.file Files OpenOption Path)))

(set! *warn-on-reflection* true)

(defn- decode-tool-metadata [metadata]
  (mc/decode ::metabot-v3.tools.interface/metadata
             metadata
             (mtx/transformer
              (mtx/json-transformer)
              (mtx/default-value-transformer)
              {:name :metadata-file})))

(defmulti ^:private read-tool-metadata
  "Read tool metadata from a `place`... can be a tool keyword name, filename (string), or `Path`."
  {:arglists '([place])}
  class)

(mu/defmethod read-tool-metadata Path :- ::metabot-v3.tools.interface/metadata
  [^Path path :- (lib.schema.common/instance-of-class Path)]
  (try
    (with-open [is (Files/newInputStream path (u/varargs OpenOption))
                r  (java.io.InputStreamReader. is)]
      (u/prog1 (decode-tool-metadata (json/parse-stream r true))
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

(defmethod read-tool-metadata :default
  [filename]
  (u.files/with-open-path-to-resource [path filename]
    (read-tool-metadata path)))

(defmethod read-tool-metadata clojure.lang.Keyword
  [tool-name]
  (read-tool-metadata (format "metabase_enterprise/metabot_v3/tools/%s.json" (name tool-name))))

(def registry
  "The registry of all available tools."
  {})

(defn register-tool!
  "Registers a new tool - you should use `deftool` instead."
  [tool-name options]
  (let [schema (read-tool-metadata (keyword tool-name))]
    (alter-var-root #'registry assoc (symbol tool-name)
                    {:schema schema
                     :applicable? (or (:is-applicable? options)
                                      (fn [_context] true))
                     :output-fn (cond
                                  (:output options)
                                  (constantly (:output options))

                                  (:output-fn options)
                                  (:output-fn options)

                                  :else (constantly nil))

                     :name tool-name})))

(defn resolve-tool
  "Resolves the tool name, returning a map containing tool information"
  [tool-name]
  (get registry (symbol (name tool-name))))

(defmacro deftool
  "Defines a new tool. Used like:

  (deftool my-tool-name
    \"My tool description - sent to the LLM\"
    [[:a-parameter {:description \"Mandatory parameter description, sent to the LLM\"}]]
    :option-1 ...)

  Available options are:
  - `:applicable?` - a function of the `context`, returns truthy if the tool can be called in this context
  - `:output` - a static `output` that should be sent to the LLM as the result of this tool call.
  - `:output-fn` - a function of `context` that will generate the output to send to the LLM as the result of this tool call.

  Note that if `output` and `output-fn` are not set, OR if `(output-fn context)` returns `nil`, we will send the tool
  call to the frontend."
  [tool-name & {:as options}]
  `(register-tool! (str '~tool-name)
                   ~options))

(ns metabase.core.init-test
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [metabase.config.core :as config]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn- init-namespaces :- [:set simple-symbol?]
  []
  (into (sorted-set)
        (filter (fn [ns-symb]
                  (re-matches #"^metabase(?:-enterprise)?\.(?!core)[^.]+\.init$" (str ns-symb))))
        (ns.find/find-namespaces (classpath/system-classpath))))

(mu/defn- ns->file :- [:maybe (ms/InstanceOfClass java.net.URL)]
  ^java.net.URL [ns-symb :- simple-symbol?]
  (let [filename (-> ns-symb
                     (str/replace #"\." "/")
                     (str/replace #"-" "_"))]
    (some (fn [extension]
            (io/resource (str filename extension)))
          [".clj" ".cljc" ".cljs"])))

(mu/defn ns-requires :- [:maybe [:set simple-symbol?]]
  "Get the set of namespace symbols required by a namespace in its `ns` form."
  [ns-symb :- simple-symbol?]
  (when-let [file (ns->file ns-symb)]
    (let [decl        (ns.file/read-file-ns-decl file)
          static-deps (ns.parse/deps-from-ns-decl decl)]
      (into (sorted-set) static-deps))))

(deftest ^:parallel core-init-should-require-all-init-namespaces-test
  (let [init-namespaces        (init-namespaces)
        oss-core-init-requires (ns-requires 'metabase.core.init)
        ee-core-init-requires  (when config/ee-available?
                                 (ns-requires 'metabase-enterprise.core.init))]
    (doseq [init-namespace init-namespaces
            :let           [core-init-namespace (if (str/starts-with? init-namespace "metabase.")
                                                  'metabase.core.init
                                                  'metabase-enterprise.core.init)
                            core-init-requires  (if (str/starts-with? init-namespace "metabase.")
                                                  oss-core-init-requires
                                                  ee-core-init-requires)]]
      (testing (format "%s should require %s" core-init-namespace init-namespace)
        (is (contains? core-init-requires init-namespace))))))

(mu/defn settings-namespaces :- [:set simple-symbol?]
  "Get the set of module settings namespaces starting with `ns-prefix` e.g. `\"metabase.\"`."
  []
  (into (sorted-set)
        (filter (fn [ns-symb]
                  (re-matches #"^metabase(?:-enterprise)?\.(?!core)[^.]+\.settings$" (str ns-symb))))
        (ns.find/find-namespaces (classpath/system-classpath))))

(mu/defn settings-namespace->init-namespace :- simple-symbol?
  "Get the `.init` namespace that should require a `.settings` namespace

    (settings-namespace->init-namespace 'metabase.query-processor.settings) => 'metabase.query-processor.init"
  [ns-symb :- simple-symbol?]
  (symbol (str/replace ns-symb #"\.settings$" ".init")))

(deftest ^:parallel settings-namespaces-should-be-required-by-init-namespaces-test
  (let [settings-namespaces (settings-namespaces)]
    (doseq [settings-namespace settings-namespaces
            :let               [init-namespace (settings-namespace->init-namespace settings-namespace)
                                init-requires  (ns-requires init-namespace)]]
      (testing (format "%s should require %s" init-namespace settings-namespace)
        (is (contains? init-requires settings-namespace))))))

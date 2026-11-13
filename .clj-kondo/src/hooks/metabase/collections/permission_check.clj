(ns hooks.metabase.collections.permission-check
  "Lint that collection permission checks go through the governing-collection functions in
  `metabase.collections.core`. A hand-written check on `:model/Collection` and an id, or on the root collection
  placeholder, is easy to skip when the id is nil, or to make against the wrong namespace's root.

  Registered as an `:analyze-call` hook in `.clj-kondo/config.edn`. Returns its input unchanged so Kondo's normal
  analysis of the call still runs."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common.modules :as modules]))

(def ^:private by-id-modules
  '#{collections collections.rest})

(def ^:private root-placeholder-modules
  '#{collections})

(def ^:private root-namespaces
  '#{metabase.collections.models.collection.root
     metabase.collections.models.collection})

(def ^:private root-placeholder-fns
  '#{root-collection-with-ui-details hydrated-root-collection})

(defn- test-file?
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn- root-var-name
  "The unqualified name of the var `node` resolves to, if it is in one of the [[root-namespaces]]. A local does not
  resolve, so a shadowing binding is not flagged."
  [node]
  (when (hooks/token-node? node)
    (let [sym (hooks/sexpr node)]
      (when (symbol? sym)
        (when-let [{resolved-ns :ns, resolved-name :name} (try
                                                            (hooks/resolve {:name sym})
                                                            (catch Exception _ nil))]
          (when (contains? root-namespaces resolved-ns)
            resolved-name))))))

(defn- root-placeholder-node?
  [node]
  (or (= 'root-collection (root-var-name node))
      (and (hooks/list-node? node)
           (let [[f arg] (:children node)]
             (or (contains? root-placeholder-fns (root-var-name f))
                 (and (hooks/token-node? f)
                      (contains? '#{assoc clojure.core/assoc} (hooks/sexpr f))
                      (= 'root-collection (root-var-name arg))))))))

(defn- allowed-modules
  "The modules that may check `checked-node`, or nil when any module may."
  [checked-node]
  (cond
    (and (hooks/keyword-node? checked-node)
         (= :model/Collection (hooks/sexpr checked-node)))
    by-id-modules

    (root-placeholder-node? checked-node)
    root-placeholder-modules))

(defn lint-permission-check
  "`:analyze-call` hook; see the namespace docstring."
  [{:keys [node ns filename] :as input}]
  (when (and ns (not (test-file? filename)))
    (let [[fn-node checked-node] (:children node)]
      (when-let [allowed (some-> checked-node allowed-modules)]
        (when-not (contains? allowed (modules/module (modules/config input) ns))
          (hooks/reg-finding!
           (assoc (meta checked-node)
                  :message (format (str "Do not call `%s` on a collection directly: a nil collection id means a root"
                                        " collection, and this check is easy to skip or to make against the wrong"
                                        " root. Use `can-read-governing-collection?`,"
                                        " `can-write-governing-collection?`, `check-read-governing-collection` or"
                                        " `check-write-governing-collection` from `metabase.collections.core`.")
                                   (hooks/sexpr fn-node))
                  :type :metabase/collection-permission-check))))))
  input)

(ns hooks.metabase.global-system.system
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn- own-key?
  "Whether `node` is a literal keyword in the namespace `ns`, written as `::k` or with the namespace spelled out."
  [node ns]
  (when (hooks/keyword-node? node)
    (let [{:keys [k namespaced?]} node]
      (if namespaced?
        (nil? (namespace k))
        (= (namespace k) (str ns))))))

;; The module linter only sees namespace references, so a handle built from another module's keyword would reach
;; that module's component unnoticed. Requiring the key to belong to the calling namespace keeps each component
;; reachable only through its owner. This guards against accidental coupling, not deliberate bypass: interop such as
;; `(ComponentHandle. k)` is not a call this hook sees.
(defn mutable-component-handle
  "Report a call to `mutable-component-handle` whose key is not a literal keyword in the calling namespace."
  [{:keys [node ns]}]
  (let [[_ key-node] (:children node)]
    (when-not (own-key? key-node ns)
      (hooks/reg-finding! (assoc (meta (or key-node node))
                                 :message (str "A component handle must use a keyword in this namespace, such as "
                                               "::my-component. Reach another module's component through its "
                                               "accessors.")
                                 :type    :metabase/component-handle-own-key))))
  nil)

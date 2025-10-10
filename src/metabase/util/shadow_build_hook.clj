(ns metabase.util.shadow-build-hook
  "Do not require this from a normal app, it's a shadow-cljs hook"
  (:require
   [cljs.compiler :as comp]
   [cljs.env :as env]
   [clojure.string :as str]
   [shadow.build.output]))

(defn js-module-src-append
  "Replacement for https://github.com/thheller/shadow-cljs/blob/425740ca9a0096aeeae5d5134f3531cfce5baa6b/src/main/shadow/build/output.clj#L521"
  [state {:keys [ns] :as src}]
  (if-not ns
    ;; none-cljs, export the shortest name always, some goog files have multiple provides
    (str "\nmodule.exports = "
         (->> (:provides src)
              (map str)
              (sort)
              (map comp/munge)
              (first))
         ";\n")
    ;; cljs ns, export vars.
    ;; enumarable only if tagged with :export or :export-as
    (->> (get-in state [:compiler-env :cljs.analyzer/namespaces ns :defs])
         (vals)
         (filter (fn [def]
                   (let [{:keys [export export-as]} (:meta def)]
                     (or export (string? export-as)))))
         ;; FIXME: any potential for :line missing?
         ;; if so should they be first or last?
         (sort-by #(:line % 0))
         (map (fn [def]
                (let [{:keys [export-as doc jsdoc]}
                      (:meta def)

                      export-name
                      (if (string? export-as)
                        export-as

                        (let [def-name (symbol (name (:name def)))]
                          (if (= 'default def-name) ;; avoid munge to default$
                            "default"
                            (comp/munge def-name))))
                      munged (comp/munge (:name def))]

                  (str (when (or doc jsdoc)
                         (binding [env/*compiler* (atom {})]
                           (with-out-str (comp/emit-comment doc (some->> (seq jsdoc)
                                                                     (into [(str "@callback " munged)]))))))
                       "Object.defineProperty(module.exports, \"" export-name "\", { "
                       "enumerable: true, "
                       "\n/**\n * @returns {" munged "} \n **/\n"
                       "get: function() { return " munged "; }"
                       " });"))))
         (str/join "\n"))))

(alter-var-root #'shadow.build.output/js-module-src-append (fn [_] js-module-src-append))

(defn hook
  {:shadow.build/stage :compile-prepare}
  [build-state & _args]
  build-state)

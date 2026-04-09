(ns hooks.clojure.core.defmulti
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.clojure.core.def]
   [hooks.common]))

(defn- check-arglists [report-node arglists]
  (letfn [(reg-bad-arglists! []
            (hooks/reg-finding!
             (assoc (meta report-node)
                    :message ":arglists should be a quoted list of vectors [:metabase/check-defmulti-arglists]"
                    :type :metabase/check-defmulti-arglists)))
          (reg-bad-arg! []
            (hooks/reg-finding!
             (assoc (meta report-node)
                    :message ":arglists should contain actual arg names, not underscore (unused) symbols [:metabase/check-defmulti-arglists]"
                    :type    :metabase/check-defmulti-arglists)))
          (underscore-arg? [arg]
            (and (symbol? arg)
                 (str/starts-with? arg "_")))
          (check-arglist [arglist]
            (cond
              (not (vector? arglist))        (reg-bad-arglists!)
              (some underscore-arg? arglist) (reg-bad-arg!)))]
    (if-not (and (seq? arglists)
                 (= (first arglists) 'quote)
                 (seq (second arglists)))
      (reg-bad-arglists!)
      (let [[_quote arglists] arglists]
        (doseq [arglist arglists]
          (check-arglist arglist))))))

(defn- defmulti-check-for-arglists-metadata
  "Make sure a [[defmulti]] has an attribute map with `:arglists` metadata."
  [node]
  (let [[_defmulti _symb & args] (:children node)
        [_docstring & args]      (if (hooks/string-node? (first args))
                                   args
                                   (cons nil args))
        attr-map                 (when (hooks/map-node? (first args))
                                   (first args))
        arglists                 (some-> attr-map hooks/sexpr :arglists seq)]
    (if-not (seq? arglists) ; should be a list or at least list-like
      (hooks/reg-finding!
       (assoc (meta node)
              :message "All defmultis should have an attribute map with :arglists metadata. [:metabase/check-defmulti-arglists]"
              :type    :metabase/check-defmulti-arglists))
      (check-arglists attr-map arglists))))

(defn lint-defmulti [x]
  (defmulti-check-for-arglists-metadata (:node x))
  (hooks.clojure.core.def/lint-def* x)
  x)

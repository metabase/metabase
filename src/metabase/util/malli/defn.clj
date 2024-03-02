(ns metabase.util.malli.defn
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.string :as str]
   [malli.destructure]
   [metabase.util :as u]
   [metabase.util.malli.fn :as mu.fn]
   [net.cgrand.macrovich :as macros]))

(set! *warn-on-reflection* true)

;;; TODO -- this should generate type hints from the schemas and from the return type as well.
(defn- deparameterized-arglist [{:keys [args]}]
  (-> (malli.destructure/parse args)
      :arglist
      (with-meta (macros/case
                  :cljs
                   (meta args)

                   ;; make sure we resolve classnames e.g. `java.sql.Connection` intstead of `Connection`, otherwise the
                   ;; tags won't work if you use them in another namespace that doesn't import that class. (Clj only)
                   :clj
                   (let [args-meta    (meta args)
                         tag          (:tag args-meta)
                         resolved-tag (when (symbol? tag)
                                        (let [resolved (ns-resolve *ns* tag)]
                                          (when (class? resolved)
                                            (symbol (.getName ^Class resolved)))))]
                     (cond-> args-meta
                       resolved-tag (assoc :tag resolved-tag)))))))

(defn- deparameterized-arglists [{:keys [arities], :as _parsed}]
  (let [[arities-type arities-value] arities]
    (case arities-type
      :single   (list (deparameterized-arglist arities-value))
      :multiple (map deparameterized-arglist (:arities arities-value)))))

(defn- annotated-docstring
  "Generate a docstring with additional information about inputs and return type using a parsed fn tail (as parsed
  by [[mx/SchematizedParams]])."
  [{original-docstring           :doc
    [arities-type arities-value] :arities
    :keys                        [return]
    :as                          _parsed}]
  (str/trim
   (str "Inputs: " (case arities-type
                     :single   (pr-str (:args arities-value))
                     :multiple (str "("
                                    (str/join "\n           "
                                              (map (comp pr-str :args)
                                                   (:arities arities-value)))
                                    ")"))
        "\n  Return: " (str/replace (u/pprint-to-str (:schema return :any))
                                    "\n"
                                    (str "\n          "))
        (when (not-empty original-docstring)
          (str "\n\n  " original-docstring)))))

(defmacro defn
  "Implementation of [[metabase.util.malli/defn]]. Like [[schema.core/defn]], but for Malli.

  Doesn't Malli already have a version of this in [[malli.experimental]]? It does, but it tends to eat memory; see
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1690496060299339 and #32843 for more information. This new
  implementation solves most of our memory consumption problems.

  Unless it's in a skipped namespace during prod, (see: [[mu.fn/instrument-ns?]]) this macro emits clojure code to
  validate its inputs and outputs based on its malli schema annotations.

  Example macroexpansion:

    (mu/defn f :- :int
      [x :- :int]
      (inc x))

    ;; =>

    (def f
      (let [&f (fn [x] (inc x))]
        (fn ([a]
             (metabase.util.malli.fn/validate-input :int a)
             (->> (&f a)
                  (metabase.util.malli.fn/validate-output :int))))))

  Known issue: does not currently generate automatic type hints the way [[schema.core/defn]] does, nor does it attempt
  to preserve them if you specify them manually. We can fix this in the future."
  [& [fn-name :as fn-tail]]
  (let [parsed           (mu.fn/parse-fn-tail fn-tail)
        {attr-map :meta} parsed
        attr-map         (merge
                          {:arglists (list 'quote (deparameterized-arglists parsed))
                           :schema   (mu.fn/fn-schema parsed)}
                          attr-map)
        docstring        (annotated-docstring parsed)
        instrument?      (mu.fn/instrument-ns? *ns*)]
    (if-not instrument?
      `(def ~(vary-meta fn-name merge attr-map)
         ~docstring
         ~(mu.fn/deparameterized-fn-form parsed))
      `(def ~(vary-meta fn-name merge attr-map)
         ~docstring
         ~(macros/case
            :clj  (let [error-context {:fn-name (list 'quote fn-name)}]
                    (mu.fn/instrumented-fn-form error-context parsed))
            :cljs (mu.fn/deparameterized-fn-form parsed))))))

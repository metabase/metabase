(ns metabase.util.malli.defn
  (:refer-clojure :exclude [defn defn-])
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [malli.destructure]
   [me.flowthing.pp :as pp]
   [metabase.util.malli.fn :as mu.fn]
   [net.cgrand.macrovich :as macros]))

(set! *warn-on-reflection* true)

;;; TODO -- this should generate type hints from the schemas and from the return type as well.
(core/defn- deparameterized-arglist [{:keys [args]}]
  (-> (malli.destructure/parse args)
      :arglist
      (with-meta (macros/case
                   :cljs
                   (meta args)

                   ;; make sure we resolve classnames e.g. `java.sql.Connection` instead of `Connection`, otherwise the
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

(core/defn- deparameterized-arglists [parsed]
  (let [{:keys [arities]} (:values parsed)
        arities-type (:key arities)
        arities-value (:values (:value arities))]
    (case arities-type
      :single   (list (deparameterized-arglist arities-value))
      :multiple (map #(deparameterized-arglist (:values %)) (:arities arities-value)))))

(core/defn- annotated-docstring
  "Generate a docstring with additional information about inputs and return type using a parsed fn tail (as parsed
  by [[mx/SchematizedParams]])."
  [parsed]
  (let [{:keys [doc arities return]} (:values parsed)
        arities-type (:key arities)
        arities-value (:values (:value arities))]
    (str/trim
     (str "Inputs: " (case arities-type
                       :single   (pr-str (:args arities-value))
                       :multiple (str "("
                                      (str/join "\n           "
                                                (map (comp pr-str :args :values)
                                                     (:arities arities-value)))
                                      ")"))
          "\n  Return: " (str/replace (with-out-str
                                        #_{:clj-kondo/ignore [:discouraged-var]}
                                        (pp/pprint (:schema (:values return) :any)
                                                   {:max-width 120}))
                                      "\n"
                                      "\n          ")
          (when (not-empty doc)
            (str "\n\n  " doc))))))

(defmacro defn
  "Implementation of [[metabase.util.malli/defn]]. Like [[schema.core/defn]], but for Malli.

  Doesn't Malli already have a version of this in [[malli.experimental]]? It does, but it tends to eat memory; see
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1690496060299339 and #32843 for more information. This new
  implementation solves most of our memory consumption problems.

  Unless it's in a skipped namespace during prod, (see: [[mu.fn/instrument-ns?]]) this macro emits clojure code to
  validate its inputs and outputs based on its malli schema annotations.

  Supports a map after the arg list with `:pre` and `:post`, like regular Clojure functions, but also allows `:test/pre`
  and `:test/post` which are \"weightless\" in release builds. The `:pre` and `:post` are always included, and are
  handled by the CLJ(S) compiler as normal. The `:test/pre` and `:test/post` are combined with the un-namespaced ones
  only when [[metabase.configuration.core/is-prod?]] is false. Additionally, each predicate from the `:test/*` variants
  is wrapped with `(or (not mu.fn/*enforce*) ...)` so it only applies *dynamically* when [[mu.fn/*enforce*]] is true.
  That means the test variants can be disabled by e.g. a test that does known-broken things and wants to check the prod
  code actually rejects it, not just the dev/test-only assertions.

  Example macroexpansion:

    (mu/defn f :- :int
      [x :- :int]
      {:post      [(pos? %)]
       :test/post [(even? %)]}
      (inc x))

    ;; =>

    (def f
      (let [&f (fn [x]
                 {:post [(pos? %) (or (not *enforce*) (even? %))]}
                 (inc x))]
        (fn ([a]
             (metabase.util.malli.fn/validate-input :int a)
             (->> (&f a)
                  (metabase.util.malli.fn/validate-output :int))))))

  Known issue: does not currently generate automatic type hints the way [[schema.core/defn]] does, nor does it attempt
  to preserve them if you specify them manually. We can fix this in the future."
  {:style/indent [:defn]}
  [& [fn-name :as fn-tail]]
  (let [parsed           (mu.fn/parse-fn-tail fn-tail)
        cosmetic-name    (gensym (munge (str fn-name)))
        {attr-map :meta} (:values parsed)
        docstring        (annotated-docstring parsed)
        attr-map         (merge
                          {:arglists (list 'quote (deparameterized-arglists parsed))
                           :schema   (mu.fn/fn-schema parsed {:target :target/metadata})}
                          attr-map
                          ;; Don't include docstrings in CLJS to prevent them slipping into release build and
                          ;; inflating the bundle.
                          (macros/case
                            :clj  {:doc docstring}
                            :cljs nil))
        instrument?      (mu.fn/instrument-ns? *ns*)]
    `(def ~(vary-meta fn-name merge attr-map)
       ~(if instrument?
          (macros/case
            :clj  (let [error-context {:fn-name (list 'quote fn-name)}]
                    (mu.fn/instrumented-fn-form error-context :clj parsed cosmetic-name))
            :cljs (mu.fn/deparameterized-fn-form :cljs parsed cosmetic-name))
          (mu.fn/deparameterized-fn-form (macros/case :clj :clj, :cljs :cljs) parsed)))))

(defmacro defn-
  "Same as defn, but creates a private def."
  [fn-name & fn-tail]
  `(defn
     ~(with-meta fn-name (assoc (meta fn-name) :private true))
     ~@fn-tail))

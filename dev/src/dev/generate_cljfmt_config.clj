(ns dev.generate-cljfmt-config
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]
   [clojure.tools.namespace.find :as ns.find]))

;; code below to convert from `:style/indent` specs to cljfmt specs is adapted from
;; https://github.com/clojure-lsp/clojure-lsp/blob/4242be682640acc2a083ee10fc1fb51bca7ac08a/lib/src/clojure_lsp/feature/format.clj#L35-L81

(defn- arg-spec->cljfmt-arg [index argspec]
  (letfn [(depth [x]
            (cond
              (vector? x)      (inc (depth (first x)))
              (or (number? x)
                  (= :defn x)) 0
              :else            -1000))]
    (let [d (depth argspec)]
      (when-not (neg? d)
        [:inner d index]))))

(defn- style-indent->cljfmt-spec
  "Converts Cider's `:style/indent` metadata into a cljfmt `:indents` spec.

  See the details at https://docs.cider.mx/cider/indent_spec.html but a quick sketch follows.
  - Top-level numbers or keywords are shorthand for [x].
  - The first element of the list is a number, `:defn` or `:form`.
    - Numbers give the number of special args (`[:block N]` in cljfmt)
    - `:defn` means indent like a `defn` (`[:inner 0]` in cljfmt)
    - `:form` means indent like a normal `(f a b)` form.
  - Each following value is a nested indent spec for the argument at that position.
    - cljfmt doesn't support full nesting, but it can approximate with `[:inner depth pos]`.
    - The final spec applies to all args; this corresponds to an `[:inner depth]` with no index."
  [spec]

  (let [[sym & args]        (if (vector? spec)
                              spec
                              [spec])
        sym-spec            (cond
                              (number? sym) [:block sym]
                              (= sym :defn) [:inner 0]
                              (= sym :form) [:default])
        arg-specs           (keep-indexed arg-spec->cljfmt-arg args)
        [tk td ti :as tail] (last arg-specs)]
    (->> (concat (when sym-spec [sym-spec])
                 (butlast arg-specs)
                 ;; The last arg spec in :style/indent applies to all remaining args.
                 ;; So if it generated a [:inner depth index], strip off the index.
                 ;; But only some args generate arg-specs, and there might be no args at all.
                 (cond
                   ;; Last arg generated [:inner depth index], remove the index
                   (and (= tk :inner)
                        (= ti (dec (count args)))) [[:inner td]]
                   ;; Last argspec doesn't match the last arg.
                   tail [tail]
                   ;; No argspecs at all.
                   :else nil))
         vec
         not-empty)))

(def overrides
  '{methodical.core/with-dispatcher        [[:default]]
    methodical.core/with-method-table      [[:default]]
    methodical.core/with-prefers           [[:default]]
    methodical.interface/with-dispatcher   [[:default]]
    methodical.interface/with-method-table [[:default]]
    methodical.interface/with-prefers      [[:default]]})

(defn specs []
  (into
   (sorted-map)
   (comp (filter (fn [ns-symb]
                   (some #(str/starts-with? ns-symb %)
                         ["metabase"
                          ;; build scripts and other stuff in `bin`
                          "build"
                          "i18n"
                          "metabuild-common"
                          ;; important libraries
                          "methodical"
                          "saml20-clj"
                          "toucan2"])))
         (mapcat (fn [ns-symb]
                   (try
                     (require ns-symb)
                     (ns-interns ns-symb)
                     (catch Throwable _
                       nil))))
         (map (fn [[_symb varr]]
                (when-let [indent-spec (:style/indent (meta varr))]
                  (when-let [cljfmt-spec (or
                                          (get overrides (symbol varr))
                                          (style-indent->cljfmt-spec indent-spec))]
                    (if (or (:macro (meta varr))
                            (= cljfmt-spec [[:default]]))
                      [(symbol varr) cljfmt-spec]
                      ;; this is to warn people when using indentation specs on plain functions that almost certainly
                      ;; should just have [[:default]] formatting
                      [(symbol varr) (symbol (str "#_not-a-macro " (pr-str cljfmt-spec)))]))))))
   (ns.find/find-namespaces (classpath/system-classpath))))

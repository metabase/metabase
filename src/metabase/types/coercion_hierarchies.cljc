(ns metabase.types.coercion-hierarchies
  (:require
   [clojure.set :as set]))

;; these need to be defonce so we don't drop our hierarchies, but defonce doesn't support docstrings:
;; https://clojure.atlassian.net/browse/CLJ-1148

(defonce ^:private
  ^{:doc "Map of `coercion-strategy -> #{allowed-base-type}`."}
  strategy->allowed-base-types
  (atom {}))

(defonce ^:private
  ^{:doc "Map of coercion strategy -> resulting effective-type"}
  strategy->effective-type
  (atom {}))

(defonce ^:private
  ^{:doc "Map of base-type -> #{strategy} which are not inheritable. Eg, binary fields are marked `type/*` and may be coerced
  to timestamps with `:Coercion/YYYYMMDDHHMMSSBytes->Temporal` but we don't want all children of `type/*` to be
  coerced as such."}
  non-descending-base-type->strategy
  (atom {}))

(defn non-descending-strategies
  "Get a map of strategies -> allowed-base-types. These must live outside of the hierarchy."
  []
  @non-descending-base-type->strategy)

(defn effective-type-for-strategy
  "Gets the effective type for strategy. Essentially a getter over the
  private strategy->effective-type."
  [strategy]
  (get @strategy->effective-type strategy))

(defn- one-or-many
  "Ensure x is a sequential collection. Copied from metabase.util as that namespace is not amenable to cljc."
  [x]
  (if ((some-fn sequential? set? nil?) x) x [x]))

(defn define-types!
  "Define the `base-type-or-types` allowed and the resulting `effective-type` of a `coercion-strategy`."
  [coercion-strategy base-type-or-types effective-type]
  (let [base-types (set (one-or-many base-type-or-types))]
    (swap! strategy->allowed-base-types assoc coercion-strategy base-types))
  (swap! strategy->effective-type assoc coercion-strategy effective-type))

(defn define-non-inheritable-type!
  "Define coercion strategies that should not exist for all of the descendants of base-type-or-types."
  [coercion-strategy base-type-or-types effective-type]
  (swap! non-descending-base-type->strategy
         (partial merge-with set/union)
         (zipmap (one-or-many base-type-or-types) (repeat #{coercion-strategy})))
  (swap! strategy->effective-type assoc coercion-strategy effective-type))

(defn- build-hierarchy [pairs]
  (reduce
   (fn [h [tag parent]]
     (derive h tag parent))
   #?(:clj @#'clojure.core/global-hierarchy
      :cljs @(#'clojure.core/get-global-hierarchy))
   pairs))

;; atom is nil => rebuild the hierarchy

(def ^:private base-type-hierarchy*
  (atom nil))

(defn base-type-hierarchy
  "The global hierarchy, with coercion strategies added as ancestors of their allowed base type(s)."
  []
  (when-not @base-type-hierarchy*
    (locking base-type-hierarchy*
      (when-not @base-type-hierarchy*
        (reset! base-type-hierarchy* (build-hierarchy (for [[strategy base-types] @strategy->allowed-base-types
                                                            base-type             base-types]
                                                        [base-type strategy]))))))
  @base-type-hierarchy*)

(def ^:private effective-type-hierarchy*
  (atom nil))

(defn effective-type-hierarchy
  "The global hierarchy, with coercion strategies added as children of their resulting effective type."
  []
  (when-not @effective-type-hierarchy*
    (locking effective-type-hierarchy*
      (when-not @effective-type-hierarchy*
        (reset! effective-type-hierarchy* (build-hierarchy (seq @strategy->effective-type))))))
  @effective-type-hierarchy*)

;; rebuild coercion hierarchies if the global hierarchy changes
(add-watch
 #?(:clj #'clojure.core/global-hierarchy
    :cljs (#'clojure.core/get-global-hierarchy))
 ::rebuild-hierarchies
 (fn [_key _ref old new]
   (when-not (= old new)
     (reset! base-type-hierarchy* nil)
     (reset! effective-type-hierarchy* nil))))

;; rebuild coercion hierarchies if the type map atoms change

(add-watch
 strategy->allowed-base-types
 ::rebuild-hierarchies
 (fn [_key _ref old new]
   (when-not (= old new)
     (reset! base-type-hierarchy* nil))))

(add-watch
 strategy->effective-type
 ::rebuild-hierarchies
 (fn [_key _ref old new]
   (when-not (= old new)
     (reset! effective-type-hierarchy* nil))))

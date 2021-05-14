(ns metabase.types.coercion-hierarchies
  (:require [metabase.shared.util.log :as log]))

(def ^:private strategy->allowed-base-types
  "Map of `coercion-strategy -> #{allowed-base-type}`."
  (atom {}))

(def ^:private strategy->effective-type
  "Map of coercion strategy -> resulting effective-type"
  (atom {}))

(defn define-types!
  "Define the `base-type-or-types` allowed and the resulting `effective-type` of a `coercion-strategy`."
  [coercion-strategy base-type-or-types effective-type]
  (let [base-types (set (if (coll? base-type-or-types) base-type-or-types [base-type-or-types]))]
    (swap! strategy->allowed-base-types assoc coercion-strategy base-types))
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
        (log/trace "Building coercion strategy base type hierarchy")
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
        (log/trace "Building coercion strategy effective type hierarchy")
        (reset! effective-type-hierarchy* (build-hierarchy (seq @strategy->effective-type))))))
  @effective-type-hierarchy*)

;; rebuild coercion hierarchies if the global hierarchy changes
(add-watch
 #?(:clj #'clojure.core/global-hierarchy
    :cljs (#'clojure.core/get-global-hierarchy))
 ::rebuild-hierarchies
 (fn [_ _ old new]
   (when-not (= old new)
     (log/trace "Global hierarchy changed, coercion hierarchies need to be rebuilt")
     (reset! base-type-hierarchy* nil)
     (reset! effective-type-hierarchy* nil))))

;; rebuild coercion hierarchies if the type map atoms change

(add-watch
 strategy->allowed-base-types
 ::rebuild-hierarchies
 (fn [_ _ old new]
   (when-not (= old new)
     (log/trace "strategy->allowed-base-types changed, base-type hierarchy needs to be rebuilt")
     (reset! base-type-hierarchy* nil))))

(add-watch
 strategy->effective-type
 ::rebuild-hierarchies
 (fn [_ _ old new]
   (when-not (= old new)
     (log/trace "strategy->allowed-base-types changed, effective-type hierarchy needs to be rebuilt")
     (reset! effective-type-hierarchy* nil))))

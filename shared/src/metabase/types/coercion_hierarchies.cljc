(ns metabase.types.coercion-hierarchies
  (:require [metabase.shared.util.log :as log]))

(def ^:private strategy->allowed-base-types
  "Map of `coercion-strategy -> #{allowed-base-type}`."
  (atom {}))

(def ^:private strategy->effective-type
  "Map of coercion strategy -> resulting effective-type"
  (atom {}))

(defn- build-hierarchy [pairs]
  (reduce
   (fn [h [tag parent]]
     (derive h tag parent))
   #?(:clj (var-get #'clojure.core/global-hierarchy)
      :cljs (-> #'clojure.core/get-global-hierarchy var-get deref))
   pairs))

(defn- build-base-type-hierarchy []
  (build-hierarchy (for [[strategy base-types] @strategy->allowed-base-types
                         base-type             base-types]
                     [base-type strategy])))

(defn- build-effective-type-hierarchy []
  (build-hierarchy (seq @strategy->effective-type)))

(defn define-types!
  "Define the `base-type-or-types` allowed and the resulting `effective-type` of a `coercion-strategy`."
  [coercion-strategy base-type-or-types effective-type]
  (let [base-types (set (if (coll? base-type-or-types) base-type-or-types [base-type-or-types]))]
    (swap! strategy->allowed-base-types assoc coercion-strategy base-types))
  (swap! strategy->effective-type assoc coercion-strategy effective-type))

(def base-type-hierarchy
  "The global hierarchy, with coercion strategies added as ancestors of their allowed base type(s)."
  (atom (build-base-type-hierarchy)))

(def effective-type-hierarchy
  "The global hierarchy, with coercion strategies added as children of their resulting effective type."
  (atom (build-base-type-hierarchy)))

(defn- rebuild-base-type-hierarchy! []
  (reset! base-type-hierarchy (build-base-type-hierarchy)))

(defn- rebuild-effective-type-hierarchy! []
  (reset! effective-type-hierarchy (build-effective-type-hierarchy)))

;; rebuild coercion hierarchies if the global hierarchy changes
(add-watch
 #?(:clj #'clojure.core/global-hierarchy
    :cljs (var-get #'clojure.core/get-global-hierarchy))
 ::rebuild-hierarchies
 (fn [_ _ old-hierarchy new-hierarchy]
   (when-not (= old-hierarchy new-hierarchy)
     (println "Global hierarchy changed, rebuilding coercion hierarchies...")
     (rebuild-base-type-hierarchy!)
     (rebuild-effective-type-hierarchy!))))

;; rebuild coercion hierarchies if the type map atoms change

(add-watch
 strategy->allowed-base-types
 ::rebuild-hierarchies
 (fn [_ _ old-hierarchy new-hierarchy]
   (when-not (= old-hierarchy new-hierarchy)
     (println "strategy->allowed-base-types changed, rebuilding base-type-hierarchy")
     (rebuild-base-type-hierarchy!))))

(add-watch
 strategy->effective-type
 ::rebuild-hierarchies
 (fn [_ _ old-hierarchy new-hierarchy]
   (when-not (= old-hierarchy new-hierarchy)
     (println "strategy->allowed-base-types changed, rebuilding base-type-hierarchy")
     (rebuild-effective-type-hierarchy!))))

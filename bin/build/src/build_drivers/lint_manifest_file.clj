(ns build-drivers.lint-manifest-file
  (:require
   [clojure.spec.alpha :as s]
   [spell-spec.alpha :as spell]))

(s/def ::init-step (spell/keys :req-un [::step]))

(defmulti ^:private init-step-type
  {:arglists '([step])}
  :step)

(s/def ::namespace string?)
(defmethod init-step-type "load-namespace" [_]
  (spell/keys :req-un [::namespace]))

(s/def ::class string?)
(defmethod init-step-type "register-jdbc-driver" [_]
  (spell/keys :req-un [::class]))

(s/def ::name string?)
(s/def ::version string?)
(s/def ::description string?)
(s/def ::info (spell/keys :req-un [::name ::version ::description]))

(s/def ::address string?)
(s/def ::contact-info (spell/keys :req-un [::name]
                                  :opt-un [::address]))

(def ^:private property-types #{"string" "text" "textFile" "boolean" "secret" "info" "schema-filters" "section" "password"})

(s/def ::display-name string?)
(s/def ::default any?)
(s/def ::lazy-load boolean?)
(s/def ::abstract boolean?)
(s/def ::parent (s/or :single-parent string? :multiple-parent (s/coll-of string?)))

(s/def ::required boolean?)
(s/def ::placeholder any?)
(s/def ::type #(contains? property-types %))
(s/def ::visible-if (s/map-of keyword? any?))

(s/def ::connection-property-map (spell/keys :opt-un [::display-name ::default ::required ::placeholder ::type
                                                      ::visible-if]))

(s/def ::raw-property-name-ref string?)
(s/def ::merge (s/cat :property-name ::raw-property-name-ref
                      :merge-map ::connection-property-map))
(s/def ::merge-map (spell/keys :req-un [::merge]))

(s/def ::container-style-type #{"grid" "component"})
(s/def ::container-style (s/cat :type ::container-style-type :value string?))
(s/def ::fields (s/coll-of ::connection-property))
(s/def ::group-map (spell/keys :req-un [::container-style ::fields]))
(s/def ::group-property (spell/keys :req-un [::group]))
(s/def ::group ::group-map)

(s/def ::connection-property (s/or :merge-with ::merge-map
                                   :group-with ::group-property
                                   :property-name ::raw-property-name-ref
                                   :property-map (s/merge (spell/keys :req-un [::name]) ::connection-property-map)))

(s/def ::connection-properties (s/coll-of ::connection-property))

(s/def ::single-driver (s/keys :req-un [::name ::lazy-load]
                               :opt-un [::parent ::display-name ::abstract ::connection-properties]))

(s/def ::driver (s/or :single-driver ::single-driver :multiple-drivers (s/coll-of ::single-driver)))

(s/def ::init (s/coll-of (s/multi-spec init-step-type #(get % :step))))

(s/def ::plugin-manifest
  (spell/keys :req-un [::info ::driver] :opt-un [::contact-info ::init]))

(ns metabase.lib.schema.common
  (:require
   [clojure.string :as str]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

;;; Schema for a string that cannot be blank.
(mr/def ::non-blank-string
  [:and
   [:string {:min 1}]
   [:fn
    {:error/message "non-blank string"}
    (complement str/blank?)]])

;;; Schema representing an integer than must also be greater than or equal to zero.
(mr/def ::int-greater-than-or-equal-to-zero
  [:int {:min 0}])

(mr/def ::positive-int
  [:int {:min 1}])

(mr/def ::uuid
  ;; TODO -- should this be stricter?
  [:string {:min 36, :max 36}])

(defn- semantic-type? [x]
  (isa? x :Semantic/*))

(mr/def ::semantic-type
  [:fn
   {:error/message "valid semantic type"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Not a valid semantic type: " (pr-str value)))}
   semantic-type?])

(defn- relation-type? [x]
  (isa? x :Relation/*))

(mr/def ::relation-type
  [:fn
   {:error/message "valid relation type"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Not a valid relation type: " (pr-str value)))}
   relation-type?])

(defn- base-type? [x]
  (and (isa? x :type/*)
       (not (semantic-type? x))
       (not (relation-type? x))))

(mr/def ::base-type
  [:fn
   {:error/message "valid base type"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Not a valid base type: " (pr-str value)))}
   base-type?])

(mr/def ::options
  [:map
   [:lib/uuid ::uuid]
   ;; these options aren't required for any clause in particular, but if they're present they must follow these schemas.
   [:base-type      {:optional true} [:maybe ::base-type]]
   [:effective-type {:optional true} [:maybe ::base-type]]
   [:semantic-type  {:optional true} [:maybe ::semantic-type]]
   [:database-type  {:optional true} [:maybe ::non-blank-string]]
   [:name           {:optional true} [:maybe ::non-blank-string]]
   [:display-name   {:optional true} [:maybe ::non-blank-string]]])

(mr/def ::external-op
  [:map
   [:lib/type [:= :lib/external-op]]
   [:operator [:or :string :keyword]]
   [:options {:optional true} ::options]
   [:args [:sequential :any]]])

(ns metabase.lib.schema.common
  (:require
   [clojure.string :as str]
   [metabase.types.core]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.memoize :as u.memo]))

(comment metabase.types.core/keep-me)

#?(:clj (set! *warn-on-reflection* true))

(defn normalize-keyword
  "Base normalization behavior for something that should be a keyword: calls [[clojure.core/keyword]] on it if it is a
  string. This is preferable to using [[clojure.core/keyword]] directly, because that will be tried on things that
  should not get converted to keywords, like numbers."
  [x]
  (cond-> x
    (string? x) keyword))

(defn normalize-keyword-lower
  "Base normalization behavior for something that should be a keyword: calls [[clojure.core/keyword]] on it if it is a
  string. This is preferable to using [[clojure.core/keyword]] directly, because that will be tried on things that
  should not get converted to keywords, like numbers."
  [x]
  (cond-> x
    (string? x) (-> u/lower-case-en keyword)))

(defn normalize-map-no-kebab-case
  "Part of [[normalize-map]]; converts keys to keywords but DOES NOT convert to `kebab-case`."
  [m]
  ;; check to make sure we actually need to update anything before we do it. [[update-keys]] always creates new maps
  ;; even if nothing has changed, this way we can avoid creating a bunch of garbage for already-normalized maps
  (let [m (cond-> m
            (and (map? m)
                 (some string? (keys m)))
            (update-keys keyword))]
    (cond-> m
      (string? (:lib/type m)) (update :lib/type keyword))))

(def HORRIBLE-keys
  "TODO (Cam 6/13/25) -- MEGA HACK -- keys that live in MLv2 that aren't SUPPOSED to be kebab-cased. We can and should
  remove these keys altogether."
  #{:model/inner_ident})

(def ^:private ^{:arglists '([k])} memoized-kebab-key
  "Calculating the kebab-case version of a key every time is pretty slow (even with the LRU caching
  [[u/->kebab-case-en]] has), since the keys here are static and finite we can just memoize them forever and
  get a nice performance boost."
  (u.memo/fast-memo (fn [k]
                      (if (contains? HORRIBLE-keys k)
                        k
                        (u/->kebab-case-en k)))))

(defn map->kebab-case
  "Convert a map to kebab case, for use with `:decode/normalize`."
  [m]
  (when (map? m)
    (update-keys m memoized-kebab-key)))

(defn normalize-map
  "Base normalization behavior for a pMBQL map: keywordize keys and keywordize `:lib/type`; convert map to
  kebab-case (excluding the so-called [[HORRIBLE-keys]]."
  [m]
  (-> m normalize-map-no-kebab-case map->kebab-case))

(defn normalize-string-key
  "Base normalization behavior for things that should be string map keys. Converts keywords to strings if needed. This
  is mostly to work around the REST API recursively keywordizing the entire request body by default."
  [x]
  (cond-> x
    (keyword? x) u/qualified-name))

(mu/defn mbql-clause-tag :- [:maybe :keyword]
  "If `x` is a (possibly not-yet-normalized) MBQL clause, return its `tag`."
  [x]
  (when (and (vector? x)
             ((some-fn keyword? string?) (first x)))
    (keyword (first x))))

(mu/defn is-clause?
  "Whether `x` is a (possibly not-yet-normalized) MBQL clause with `tag`. Does not check that the clause is valid."
  [tag :- :keyword x]
  (= (mbql-clause-tag x) tag))

(mr/def ::non-blank-string
  "Schema for a string that cannot be blank."
  [:and
   {:error/message "non-blank string"
    :json-schema   {:type "string" :minLength 1}}
   [:string {:min 1}]
   [:fn
    {:error/message "non-blank string"}
    (complement str/blank?)]])

(mr/def ::int-greater-than-or-equal-to-zero
  "Schema representing an integer than must also be greater than or equal to zero."
  [:int
   {:error/message "integer greater than or equal to zero"
    :min           0}])

(mr/def ::positive-number
  [:fn
   {:error/message "positive number"}
   (every-pred number? pos?)])

(mr/def ::uuid
  [:string
   {:decode/normalize (fn [x]
                        (cond-> x
                          (uuid? x) str))
    ;; TODO -- should this be stricter?
    :min 36
    :max 36}])

(defn- semantic-type? [x]
  (isa? x :Semantic/*))

(mr/def ::semantic-type
  [:and
   [:keyword
    {:decode/normalize normalize-keyword}]
   [:fn
    {:error/message "valid semantic type"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Not a valid semantic type: " (pr-str value)))}
    semantic-type?]])

(defn- relation-type? [x]
  (isa? x :Relation/*))

(mr/def ::relation-type
  [:and
   [:keyword
    {:decode/normalize normalize-keyword}]
   [:fn
    {:error/message "valid relation type"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Not a valid relation type: " (pr-str value)))}
    relation-type?]])

(mr/def ::semantic-or-relation-type
  [:and
   {:description "valid semantic or relation type"}
   [:keyword
    {:decode/normalize normalize-keyword}]
   [:fn
    {:error/message "valid semantic or relation type"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Not a valid semantic or relation type: " (pr-str value)))}
    (some-fn semantic-type? relation-type?)]])

(defn- base-type? [x]
  (isa? x :type/*))

(mr/def ::base-type
  [:and
   [:keyword
    {:decode/normalize normalize-keyword}]
   [:fn
    {:error/message "valid base type"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Not a valid base type: " (pr-str value)))}
    base-type?]])

(defn- normalize-options-map [m]
  (let [m (normalize-map m)]
    (-> m
        ;; add `:lib/uuid` if it's missing
        (cond-> (not (:lib/uuid m)) (assoc :lib/uuid (str (random-uuid))))
        ;; remove deprecated `:ident` key
        (dissoc :ident))))

(mr/def ::options
  [:and
   {:default {}}
   [:map
    {:decode/normalize normalize-options-map}
    [:lib/uuid ::uuid]
    ;; these options aren't required for any clause in particular, but if they're present they must follow these schemas.
    [:base-type      {:optional true} [:maybe ::base-type]]
    [:effective-type {:optional true} [:maybe ::base-type]]
    ;; these two different types are currently both stored under one key, but maybe one day we can fix this.
    [:semantic-type  {:optional true} [:maybe ::semantic-or-relation-type]]
    [:database-type  {:optional true} [:maybe ::non-blank-string]]
    [:name           {:optional true} [:maybe ::non-blank-string]]
    [:display-name   {:optional true} [:maybe ::non-blank-string]]]
   [:fn
    {:error/message ":ident is deprecated and should not be included in options maps"}
    (complement :ident)]])

(mr/def ::external-op
  [:map
   [:lib/type [:= :lib/external-op]]
   [:operator [:multi {:dispatch string?}
               [true  :string]
               [false :keyword]]]
   [:args     [:sequential :any]]
   [:options {:optional true} ::options]])

#?(:clj
   (defn- instance-of-class* [& classes]
     [:fn {:error/message (str "instance of "
                               (str/join " or "
                                         (map #(.getName ^Class %) classes)))}
      (fn [x]
        (some (fn [klass]
                (instance? klass x))
              classes))]))

#?(:clj
   (def ^{:arglists '([& classes])} instance-of-class
     "Convenience for defining a Malli schema for an instance of a particular Class."
     (memoize instance-of-class*)))

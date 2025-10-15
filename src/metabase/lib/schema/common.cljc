(ns metabase.lib.schema.common
  (:refer-clojure :exclude [update-keys every? #?@(:clj [some])])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.types.core]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.memoize :as u.memo]
   [metabase.util.performance :refer [update-keys every? #?@(:clj [some])]]))

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
  (when (map? m)
    (let [m (update-keys m keyword)]
      (cond-> m
        (string? (:lib/type m)) (update :lib/type keyword)))))

;;; TODO (Cam 8/12/25) -- this doesn't really do what I'd expect with keys like `:-` or `:-a` or `:a-` -- it strips
;;; out preceding and trailing dashes
(def ^{:arglists '([k])} memoized-kebab-key
  "Calculating the kebab-case version of a key every time is pretty slow (even with the LRU caching
  [[u/->kebab-case-en]] has), since the keys here are static and finite we can just memoize them forever and
  get a nice performance boost."
  (u.memo/fast-memo
   (fn [k]
     ;; sanity check: make sure we're not accidentally using this on a base type
     (assert (not= k :type/Text))
     ;; don't use [[u/->kebab-case-en]] here because it converts stuff like `:SuM` to `:su-m` which is not really what
     ;; we want
     (-> k
         u/qualified-name
         (str/replace #"_" "-")
         u/lower-case-en
         keyword))))

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

;;; TODO (Cam 9/8/25) -- overlapping functionality with [[metabase.lib.util/clause-of-type?]]
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
   {:error/message "positive number"
    :typescript    "number"}
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

;;; only support fixing really broken types like `:type/creationtime` to `:type/CreationTime` in prod... Malli checks
;;; will throw in dev. See [[metabase.lib.schema.common-test/normalize-base-type-test]] for more info

(mu/defn- normalize-base-type* :- [:maybe [:ref ::base-type]]
  [x]
  (normalize-keyword x))

(defn- normalize-base-type [x]
  (when-let [k (normalize-base-type* x)]
    (or (cond
          (isa? k :type/*)
          k

          (and (= (namespace k) "type")
               (= (u/lower-case-en (name k)) (name k)))
          (m/find-first (fn [base-type]
                          (= (u/lower-case-en (name base-type)) (name k)))
                        (descendants :type/*)))
        k)))

(mr/def ::base-type
  [:and
   [:keyword
    {:decode/normalize #'normalize-base-type}]
   [:fn
    {:error/message "valid base type"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Not a valid base type: " (pr-str value)))}
    base-type?]])

(defn normalize-options-map
  "Basic normalization behavior for an MBQL clause options map."
  [m]
  (let [m (normalize-map m)]
    (-> m
        ;; add `:lib/uuid` if it's missing
        (cond-> (not (:lib/uuid m)) (assoc :lib/uuid (str (random-uuid))))
        ;; remove deprecated `:ident` key
        (dissoc :ident))))

(defn- unfussy-sorted-map-compare [x y]
  (cond
    (= (type x) (type y))
    (compare x y)

    (keyword? x)
    -1

    (keyword? y)
    1

    :else
    (compare (str x) (str y))))

(defn unfussy-sorted-map
  "Like [[clojure.core/sorted-map]] but unfussy if you try to [[get]] a keyword in a string-keyed map or [[get]] a
  string in a keyword-keyed map."
  [& kvs]
  (apply sorted-map-by unfussy-sorted-map-compare kvs))

(defn encode-map-for-hashing
  "Base encoding for hashing for all MBQL 5 maps.

  - Convert to a sorted map
  - Remove all namespaced keywords"
  [m]
  (when (map? m)
    (reduce-kv
     (fn [m k v]
       (cond-> m
         (or (= k :lib/type)
             (not (qualified-keyword? k))) (assoc k v)))
     (unfussy-sorted-map)
     m)))

(mu/defn disallowed-keys
  "Helper for generating a schema to disallow certain keys in a map.

    [:and
     [:map
      [:lib/type [:= :mbql.stage/mbql]]]
     (disallowed-keys {:native \":native is not allowed in an MBQL stage\"})]

    ;; =>

    [:and
     [:map [:lib/type [:= :mbql.stage/mbql]]]
     [:fn
      {:error/message \":native is not allowed in an MBQL stage\"
       :decode/normalize #(cond-> % (map? %) (dissoc :native))}
      #(not (when (map? %) (contains? :native)))]]"
  [k->message :- [:map-of :keyword :string]]
  (let [fn-schemas (map (fn [[k message]]
                          [:fn
                           {:error/message    message
                            ;; don't try to normalize something that's not a map, e.g. no `(dissoc 1 :k)` -- this is a
                            ;; bad value anyway but not our problem to try and fix it
                            :decode/normalize (fn -normalize [m]
                                                (cond-> m
                                                  (map? m) (dissoc k)))}
                           ;; we only want an error to trigger when input is a map, not if it's `nil` or
                           ;; something (the `:map` schema can be the one that errors there)
                           (fn -pred [m]
                             (if (map? m)
                               (not (contains? m k))
                               true))])
                        k->message)]
    (if (= (count fn-schemas) 1)
      (first fn-schemas)
      (into [:and] fn-schemas))))

(mr/def ::options
  [:and
   {:default {}}
   [:map
    {:decode/normalize   #'normalize-options-map
     :encode/for-hashing #'encode-map-for-hashing}
    [:lib/uuid ::uuid]
    ;; these options aren't required for any clause in particular, but if they're present they must follow these schemas.
    [:base-type      {:optional true} [:maybe ::base-type]]
    [:effective-type {:optional true} [:maybe ::base-type]]
    ;; these two different types are currently both stored under one key, but maybe one day we can fix this.
    [:semantic-type  {:optional true} [:maybe ::semantic-or-relation-type]]
    [:database-type  {:optional true} [:maybe ::non-blank-string]]
    [:name           {:optional true} [:maybe ::non-blank-string]]
    [:display-name   {:optional true} [:maybe ::non-blank-string]]]
   (disallowed-keys
    {:ident ":ident is deprecated and should not be included in options maps"})])

(mr/def ::external-op
  [:map
   [:lib/type [:= :lib/external-op]]
   [:operator [:multi {:dispatch string?}
               [true  :string]
               [false :keyword]]]
   [:args     [:schema {:decode/normalize vec} [:sequential :any]]]
   [:options  {:optional true} ::options]])

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

(defn- kebab-cased-key? [k]
  (and (keyword? k)
       (not (str/includes? (str k) "_"))))

(defn- kebab-cased-map? [m]
  (and (map? m)
       (every? kebab-cased-key? (keys m))))

(mr/def ::kebab-cased-map
  [:fn
   {:error/message "map with all kebab-cased keys"
    :error/fn      (fn [{:keys [value]} _]
                     (if-not (map? value)
                       "map with all kebab-cased keys"
                       (str "map with all kebab-cased keys, got: " (pr-str (remove kebab-cased-key? (keys value))))))}
   kebab-cased-map?])

(def url-encoded-string-regex
  "Schema for a URL-encoded string

  This matches strings containing:

  - Unreserved characters: letters, digits, hyphens, periods, underscores, tildes
  - Percent-encoded characters: `%` followed by exactly 2 hex digits"
  #"(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+")

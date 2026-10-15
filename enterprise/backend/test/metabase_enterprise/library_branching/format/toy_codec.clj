(ns metabase-enterprise.library-branching.format.toy-codec
  "Codecs of toy kinds, for the tests of the format core: a document holds the whole item, with no kind code.

  The kinds: `:folder` items are directories and can contain every kind; a `:board` is a file that can contain
  leaves; a `:leaf` contains nothing; a `:published-table` contains nothing and has a table natural key as its
  identity. The generators of [[toy-snapshot-gen]] give snapshots of these kinds."
  (:require
   [clojure.string :as str]
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def kinds
  "The toy kinds."
  #{:folder :board :leaf :published-table})

(def may-contain
  "`{kind #{kind}}` of the toy kinds."
  {:folder          kinds
   :board           #{:leaf}
   :leaf            #{}
   :published-table #{}})

(defn- item-schema
  [kind]
  [:map {:closed true}
   [:kind  [:= kind]]
   [:name  [:string {:min 1}]]
   [:place [:maybe ::snapshot/identity]]
   [:refs  [:set ::snapshot/ref]]
   [:attrs [:map-of :keyword :any]]])

(defn- encode-ref
  [[role target]]
  (if (lb.tu/env-target? target)
    {:role (name role) :env (second target)}
    {:role (name role) :target target}))

(defn- decode-ref
  [{:keys [role env target]}]
  (when-not (string? role)
    (codec/invalid! "a reference has no role"))
  [(keyword role) (if env [:env env] target)])

(defn- encode-item
  [kind id {:keys [name place refs attrs]}]
  (cond-> {:kind (clojure.core/name kind) :id id :name name}
    (some? place) (assoc :place place)
    (seq refs)    (assoc :refs (set (map encode-ref refs)))
    (seq attrs)   (assoc :attrs attrs)))

(defn- decode-item
  [kind {:keys [id name place refs attrs] :as doc}]
  (when-not (mr/validate ::snapshot/identity id)
    (codec/invalid! (str "the id is not an identity: " (pr-str id))))
  (when-not (string? name)
    (codec/invalid! "the item has no name"))
  (when-not (= (clojure.core/name kind) (:kind doc))
    (codec/invalid! (str "the kind is not " (clojure.core/name kind))))
  [id {:kind  kind
       :name  name
       :place place
       :refs  (into #{} (map decode-ref) refs)
       :attrs (or attrs {})}])

(defrecord ToyCodec [kind word directory? home-fn]
  codec/Codec
  (kind [_] kind)
  (encode [_ id item] (encode-item kind id item))
  (decode [_ doc] (decode-item kind doc))
  (schema [_] (item-schema kind))

  layout/Layout
  (word [_] word)
  (directory? [_] directory?)
  (home [_ item] (home-fn item)))

(def codecs
  "One codec for each toy kind. A root-level folder sits in `area/`, except that a root-level folder whose `:color`
  attribute is true is the directory `area/` itself; so the directory `area/` can hold items of two levels."
  [(->ToyCodec :folder "folder" true
               (fn [item] (if (true? (get-in item [:attrs :color]))
                            {:dir [] :segment "area"}
                            {:dir ["area"]})))
   (->ToyCodec :board "board" false (constantly {:dir ["area"]}))
   (->ToyCodec :leaf "leaf" false (constantly {:dir ["area" "_leaves"]}))
   (->ToyCodec :published-table "table" false (constantly {:dir ["tables"]}))])

(def ^:private name-variants
  "Functions that change a name, so that two different names of siblings can give one slug."
  [identity str/upper-case #(str % "?") #(str % ".") #(str "_" %) (constantly "Con") (constantly "nul")])

(defn- vary-names
  [s choices]
  (into {}
        (map (fn [[id item] choice]
               [id (update item :name (nth name-variants (mod choice (count name-variants))))])
             (sort-by (comp pr-str key) s)
             (concat choices (repeat 0)))))

(defn toy-snapshot-gen
  "Generates well-formed snapshots of the toy kinds, at most `max-items` (default 30) items. Some names of siblings
  differ only in case or in a character that the slug rule removes."
  ([] (toy-snapshot-gen 30))
  ([max-items]
   (gen/fmap (fn [[s choices]] (vary-names s choices))
             (gen/tuple (lb.tu/well-formed-snapshot-gen {:kinds       kinds
                                                         :may-contain may-contain
                                                         :root-kinds  kinds
                                                         :max-items   max-items})
                        (gen/vector gen/nat 0 max-items)))))

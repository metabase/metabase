(ns metabase.util.magic-map
  (:require [cheshire.generate :as json.generate]
            [clojure
             [pprint :as pprint]
             [string :as str]
             [walk :as walk]]
            [medley.core :as m]
            [metabase.util :as u]
            [potemkin :as p]
            [toucan.models :as t.models]))

;; TODO -- consider moving to main util namespace
(p/defprotocol+ MagicMapKey
  (normalize-key [this]
    "Normalize a map key to lower-cased `lisp-case`. Returns key of the same type as argument (i.e., handles either
    keywords or strings.)"))

(extend-protocol MagicMapKey
  nil
  (normalize-key [_] nil)

  Object
  (normalize-key [this] this)

  String
  (normalize-key [s]
    (-> s str/lower-case (str/replace #"_" "-")))

  clojure.lang.Keyword
  (normalize-key [k]
    (-> (str (when-let [nmspace (namespace k)]
               (str nmspace "/"))
             (name k))
        normalize-key
        keyword)))

(p/def-map-type MagicMap [m mta]
  (get [_ k default-value]
    (get m (normalize-key k) default-value))
  (assoc [_ k v]
    (MagicMap. (assoc m (normalize-key k) v) mta))
  (dissoc [_ k]
    (MagicMap. (dissoc m (normalize-key k)) mta))
  (keys [_]
    (keys m))
  (meta [_]
    mta)
  (with-meta [_ new-meta]
    (MagicMap. m new-meta)))

(defmethod print-method MagicMap
  [^MagicMap m ^java.io.Writer writer]
  (when (seq (meta m))
    (.write writer (format "^%s " (pr-str (meta m)))))
  (.write writer "#magic ")
  (.write writer (pr-str (.m m))))

(defmethod print-dup MagicMap
  [m writer]
  (print-method m writer))

(defmethod pprint/simple-dispatch MagicMap
  [m]
  (print-method m *out*))

(alter-meta! #'->MagicMap assoc :private true)

(defn magic-map
  (^metabase.util.magic_map.MagicMap []
   (magic-map nil nil))

  (^metabase.util.magic_map.MagicMap [m]
   (into (->MagicMap {} (meta m)) m))

  (^metabase.util.magic_map.MagicMap [k v & more]
   (into (magic-map nil) (cons [k v] (partition-all 2 more)))))

(defn magic-map?
  "True if `x` is an instance of `MagicMap`."
  [x]
  (instance? MagicMap x))

(defn magical-mappify
  "Recursively convert all maps to magic maps."
  [x]
  (walk/postwalk
   #(if (map? %)
      (magic-map %)
      %)
   x))


[:datetime-field [:joined-field "my_join_alias" [:field-literal "my_field" :type/Integer]] :month]

(defn toucan-instance->magic-map [m]
  (vary-meta (magic-map m) assoc :toucan/class (class m)))

(defn ->snake-key-map [m]
  (m/map-keys u/snake-key m))

(defn- toucan-instance? [m]
  (and (record? m)
       (satisfies? t.models/IModel m)))

(defn toucan-class ^Class [m]
  (if (toucan-instance? m)
    (class m)
    (-> m meta :toucan/class)))

(defn ->toucan-instance
  ([m]
   (assert (toucan-class m)
           (format "Can't convert to a Toucan instance: ^%s %s" (some-> m class .getCanonicalName) (pr-str m)))
   (->toucan-instance (toucan-class m) m))

  ([klass m]
   (if (toucan-instance? m)
     m
     (into (.newInstance klass) (->snake-key-map m)))))

(defn toucan-name [m]
  (some-> (toucan-class m) .newInstance name))

(defn- encode-magic-map [m json-generator]
  (json.generate/encode-map
   (if-let [klass (toucan-class m)]
     (->toucan-instance m)
     (into {} (->snake-key-map m)))
   json-generator))

(json.generate/add-encoder MagicMap encode-magic-map)

(defn- do-with-toucan-instance [m f]
  (let [klass (toucan-class m)]
    (assert klass)
    (some-> m
            ->toucan-instance
            f
            (vary-meta assoc :toucan/class klass)
            toucan-instance->magic-map)))

(defmacro with-toucan-instance {:style/indent 1} [[m-binding m] & body]
  `(do-with-toucan-instance ~m (fn [~m-binding] ~@body)))

(extend-protocol t.models/IModel
  MagicMap
  (pre-insert     [m] (with-toucan-instance [m m] (t.models/pre-insert m)))
  (primary-key    [m] (with-toucan-instance [m m] (t.models/primary-key m)))
  (post-insert    [m] (with-toucan-instance [m m] (t.models/post-insert m)))
  (pre-update     [m] (with-toucan-instance [m m] (t.models/pre-update m)))
  (post-update    [m] (with-toucan-instance [m m] (t.models/post-update m)))
  (post-select    [m] (with-toucan-instance [m m] (t.models/post-select m)))
  (pre-delete     [m] (with-toucan-instance [m m] (t.models/pre-delete m)))
  (default-fields [m] (with-toucan-instance [m m] (t.models/default-fields m)))
  (hydration-keys [m] (with-toucan-instance [m m] (t.models/hydration-keys m)))
  (types          [m] (with-toucan-instance [m m] (t.models/types m)))
  (properties     [m] (with-toucan-instance [m m] (t.models/properties m))))

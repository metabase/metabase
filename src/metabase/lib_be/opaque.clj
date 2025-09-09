(ns metabase.lib-be.opaque
  (:require
   [cheshire.generate :as json.generate]
   [metabase.lib.query :as lib.query]
   [metabase.util.json :as json]
   [potemkin :as p]
   [pretty.core :as pretty]))

;;; TODO (Cam 9/8/25) --
(p/deftype+ Opaque [x metta]
  clojure.lang.IObj
  (meta [_this]
    metta)
  (withMeta [this new-meta]
    (if (= new-meta metta)
      this
      (Opaque. x new-meta)))

  Object
  (equals [this another]
    (and (= (class this) (class another))
         (= x (.x ^Opaque another))))
  (toString [this]
    (pr-str this))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `opacify x)))

(defn opaque? [x]
  (instance? Opaque x))

(defn opacify [x]
  (if (opaque? x)
    x
    (Opaque. x nil)))

(defn unwrap [x]
  (when (opaque? x)
    (.x ^Opaque x)))

(defmethod lib.query/query-method Opaque
  [metadata-providerable x]
  (lib.query/query-method metadata-providerable (unwrap x)))

(json/add-encoder Opaque (fn [x json-generator]
                           (json.generate/to-json (unwrap x) json-generator)))

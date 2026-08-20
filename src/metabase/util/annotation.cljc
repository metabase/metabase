(ns metabase.util.annotation
  "An [[Annotation]] is a unique object usable as a map key in place of a keyword. Because it is a distinct type with no
  JSON representation, a client cannot forge one by including it in data sent to the API -- which is what makes it safe
  to use for internal annotations that drive permission enforcement and other trusted decisions (see
  [[metabase.lib.schema.annotation]] for the annotations the query processor uses).

  An annotation otherwise behaves like the keyword it is named after: it is callable as a map-lookup function, sorts and
  hashes like that keyword, and reports the same `name`/`namespace`. It never `=`s a keyword, though (it is a distinct
  type), which is what keeps it un-forgeable."
  (:require
   [metabase.util.malli :as mu]))

(deftype Annotation [kw]
  #?@(:clj
      [clojure.lang.Named
       (getName [_] (name kw))
       (getNamespace [_] (namespace kw))
       ;; like a keyword, an annotation is callable as a map-lookup function: `(annotation m)` == `(get m annotation)`.
       clojure.lang.IFn
       (invoke [this m] (get m this))
       (invoke [this m not-found] (get m this not-found))
       Comparable
       (compareTo [_ other]
                  (if (instance? Annotation other)
                    (compare kw (.-kw ^Annotation other))
                    ;; annotations sort after everything else (e.g. keywords), matching how sorted maps like
                    ;; `metabase.lib.schema.common/unfussy-sorted-map` order non-keyword keys last.
                    1))
       Object
       (hashCode [_] (.hashCode ^Object kw))
       (toString [_] (str "#annotation[" kw "]"))]
      :cljs
      [INamed
       (-name [_] (name kw))
       (-namespace [_] (namespace kw))
       IFn
       (-invoke [this m] (get m this))
       (-invoke [this m not-found] (get m this not-found))
       IComparable
       (-compare [_ other]
                 (if (instance? Annotation other)
                   (compare kw (.-kw other))
                   1))
       IHash
       (-hash [_] (hash kw))
       Object
       (toString [_] (str "#annotation[" kw "]"))]))

#?(:clj (defmethod print-method Annotation [x ^java.io.Writer w]
          (.write w (str x))))

(defn annotation?
  "Is `x` an [[Annotation]]? Used by the code that would otherwise keywordize, kebab-case, deduplicate, or strip map
  keys to recognize and leave annotations untouched."
  [x]
  (instance? Annotation x))

(mu/defn annotation :- [:fn {:error/message "an annotation"} annotation?]
  "Create a unique annotation object usable as a map key, backed by (and named after) keyword `kw`."
  [kw :- :keyword]
  (->Annotation kw))

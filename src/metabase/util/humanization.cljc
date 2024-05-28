(ns metabase.util.humanization
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(defmulti name->human-readable-name
  "Convert a name, such as `num_toucans`, to a human-readable name, such as `Num Toucans`.

    (name->human-readable-name :simple \"cool_toucans\") ;-> \"Cool Toucans\"

    ;; specifiy a different strategy:
    (name->human-readable-name :none \"cool_toucans\") ;-> \"cool_toucans\""
  {:arglists '([strategy s])}
  (fn [strategy _s]
    (keyword strategy)))

(def ^:private ^:const acronyms
  #{"id" "url" "ip" "uid" "uuid" "guid"})

(defn- capitalize-word [word]
  (if (contains? acronyms (u/lower-case-en word))
    (u/upper-case-en word)
    ;; We are assuming that ALL_UPPER_CASE means we should be Title Casing
    (if (= word (u/upper-case-en word))
      (str/capitalize word)
      (str (str/capitalize (subs word 0 1)) (subs word 1)))))

;; simple replaces hyphens and underscores with spaces and capitalizes
(defmethod name->human-readable-name :simple
  [_strategy s]
  ;; explode on hyphens, underscores, and spaces
  (when (seq s)
    (let [humanized (str/join " " (for [part  (str/split s #"[-_\s]+")
                                        :when (not (str/blank? part))]
                                    (capitalize-word part)))]
      (if (str/blank? humanized)
        s
        humanized))))

;;; `:none` is just an identity implementation
(defmethod name->human-readable-name :none
  [_strategy s]
  s)

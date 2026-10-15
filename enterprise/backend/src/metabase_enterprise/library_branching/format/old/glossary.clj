(ns metabase-enterprise.library-branching.format.old.glossary
  "The old format of the kind `:glossary-term`: a file of the serdes model Glossary. A file from before glossary terms
  had an entity id is keyed by its term; its identity is [[term-identity]] of the term."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.old.common :as common])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def ^:private alphabet
  "The characters of an entity id."
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

(defn term-identity
  "The identity of the glossary term `term` of a file with no entity id: an entity id that is a function of the term
  alone, so it is the same on every instance and in every pull. Two terms have one identity iff they are equal (up to
  a collision of SHA-256)."
  ^String [^String term]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256")
                        (.getBytes (str "metabase glossary term:" term) StandardCharsets/UTF_8))]
    ;; 256 is a multiple of 64, so the low six bits of each byte are uniform.
    (apply str (map #(nth alphabet (bit-and (aget digest (int %)) 63)) (range 21)))))

(defn decode
  "`{:doc d}` of glossary document `doc`. Its identity is its entity id; a document with none has the
  [[term-identity]] of its term, also when the term looks like an entity id."
  [doc _opts]
  (let [term (:term doc)]
    (when-not (and (string? term) (seq term))
      (codec/invalid! "The glossary file has no term."))
    {:doc (common/item-doc :glossary-term (if-some [eid (:entity_id doc)] eid (term-identity term))
                           {:term term :definition (:definition doc)})}))

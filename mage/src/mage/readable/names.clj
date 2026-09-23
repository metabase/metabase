(ns mage.readable.names
  "Turning Clojure names into TypeScript-looking names."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private predicate-prefixes
  "Names ending in `?` that already read as a question don't get an `is` prefix."
  #{"is" "has" "can" "should" "was" "are" "does" "did" "will" "needs" "supports" "include" "includes"
    "contains" "allow" "allows" "uses" "use" "requires" "every" "any" "some" "not" "in" "matches"})

(defn- capitalize-first [^String s]
  (if (str/blank? s) s (str (str/upper-case (subs s 0 1)) (subs s 1))))

(defn camel
  "`user-id` -> `userId`, `can-read?` -> `canRead`, `admin?` -> `isAdmin`, `save!` -> `save`, `->id` -> `toId`,
  `a->b` -> `aToB`. Names that aren't plain kebab-case identifiers (MBQL `$field` sigils, `%`, `&`, operators) are
  returned unchanged."
  [^String s]
  (cond
    (or (str/blank? s)
        (#{"-" "->" "->>" "<>" "_" "&" "%" "..." "." "/"} s)
        (re-find #"^[$%!]" s)
        (not (re-find #"[A-Za-z]" s)))
    s

    (and (> (count s) 2) (str/starts-with? s "*") (str/ends-with? s "*"))
    (str "*" (camel (subs s 1 (dec (count s)))) "*")

    :else
    (let [pred?  (and (> (count s) 1) (str/ends-with? s "?"))
          s      (-> s
                     (str/replace #"'" "Prime")
                     (str/replace #"[?!]+$" "")
                     (str/replace #"^->" "to-")
                     (str/replace #"->" "-to-")
                     (str/replace #"<-" "-from-")
                     (str/replace #"[?!<>=*+]" "-"))
          lead   (re-find #"^_+" s)
          parts  (remove str/blank? (str/split (subs s (count (or lead ""))) #"-"))
          joined (str lead (first parts) (apply str (map capitalize-first (rest parts))))]
      (if (and pred? (not (predicate-prefixes (first parts))) (not (#{"exists" "exist"} (last parts))))
        (str (or lead "") "is" (capitalize-first (subs joined (count (or lead "")))))
        joined))))

(defn js-ident?
  "Is `s` usable as a bare JavaScript identifier / property name?"
  [s]
  (boolean (re-matches #"[A-Za-z_$][A-Za-z0-9_$]*" s)))

(defn ns->js
  "Render a namespace or alias for use as an object prefix: `perms-group` -> `permsGroup`, `api.macros` stays."
  [s]
  (->> (str/split s #"\.")
       (map camel)
       (str/join ".")))

(defn pascal
  "`transform-job.update` -> `TransformJobUpdate` (for type names derived from Malli schema keywords)."
  [s]
  (->> (str/split s #"[.\-_]")
       (remove str/blank?)
       (map #(capitalize-first (str/replace % #"[?!]" "")))
       (apply str)))

(defn js-string
  "Quote `s` as a JavaScript double-quoted string literal."
  [^String s]
  (str "\""
       (-> s
           (str/replace "\\" "\\\\")
           (str/replace "\"" "\\\"")
           (str/replace "\n" "\\n")
           (str/replace "\t" "\\t"))
       "\""))

(defn prop-key
  "Render a map key string as an object-literal key: bare if it's an identifier, quoted otherwise."
  [s]
  (if (js-ident? s) s (js-string s)))

(defn prop-access
  "Render a property access suffix for key string `s`: `.foo` or `[\"foo-bar\"]`. With `optional?`, `?.`."
  [s optional?]
  (if (js-ident? s)
    (str (if optional? "?." ".") s)
    (str (if optional? "?.[" "[") (js-string s) "]")))

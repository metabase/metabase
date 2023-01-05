(ns metabase.util.i18n.plural
  "Resources for parsing the Plural-Forms header from a translation file and determining which of multiple
  pluralities to use for a translated string."
  (:require
   [clojure.core.memoize :as memoize]
   [instaparse.core :as insta]))

(def ^:private plural-form-parser
  "This is a parser for the C-like syntax used to express pluralization rules in the Plural-Forms header in
  translation files.

  For example, the Plural-Forms header for Czech is: `nplurals=3; plural=(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2;`
  This is a parser for the expression following `plural=`.

  See the original gettext docs for more details on how pluralization rules work:
  https://www.gnu.org/software/gettext/manual/html_node/Plural-forms.html

  Operators with LOWER precedence are defined HIGHER in the grammar, and vice versa. A <maybe*> rule defines the
  grammar for all operators at or above a single level of precedence.

  The `instaparse` README (https://github.com/Engelberg/instaparse) has an example of a parser called `arithmetic`
  which is essentially a simpler version of this exact same parser. It may help to read and understand that parser
  first before trying to understand this one."
  (insta/parser
   "expr           = <s> maybe-ternary <s> <';'>? <s>

   <maybe-ternary> = ternary | maybe-or
   ternary         = maybe-or <s> <'?'> <s> maybe-ternary <s> <':'> <s> maybe-ternary

   <maybe-or>      = or-expr | maybe-and
   or-expr         = maybe-or <s> <'||'> <s> maybe-and

   <maybe-and>     = and-expr | maybe-eq
   and-expr        = maybe-and <s> <'&&'> <s> maybe-eq

   <maybe-eq>      = eq-expr | neq-expr | maybe-comp
   eq-expr         = maybe-eq <s> <'=='> <s> maybe-comp
   neq-expr        = maybe-eq <s> <'!='> <s> maybe-comp

   <maybe-comp>    = lt-expr | lte-expr | gt-expr | gte-expr | maybe-add
   lt-expr         = maybe-comp <s> <'<'> <s> maybe-add
   lte-expr        = maybe-comp <s> <'<='> <s> maybe-add
   gt-expr         = maybe-comp <s> <'>'> <s> maybe-add
   gte-expr        = maybe-comp <s> <'>='> <s> maybe-add

   <maybe-add>     = add-expr | sub-expr | maybe-mult
   add-expr        = maybe-add <s> <'+'> <s> maybe-mult
   sub-expr        = maybe-add <s> <'-'> <s> maybe-mult

   <maybe-mult>    = mult-expr | div-expr | mod-expr | operand
   mult-expr       = maybe-mult <s> <'*'> <s> operand
   div-expr        = maybe-mult <s> <'/'> <s> operand
   mod-expr        = maybe-mult <s> <'%'> <s> operand

   <operand>       = integer | variable | parens
   <parens>        = <'('> <s> expr <s> <')'>
   <s>             = <#'\\s+'>*
   integer         = #'[0-9]+'
   variable        = 'n'"))

(defn- to-bool
  "Converts an integer or Boolean to a Boolean to use in a C-style logical operator."
  [x]
  (if (integer? x)
    (if (= x 0) false true)
    x))

(defn- to-int
  "Converts an integer or Boolean to an integer to use in a C-style arithmetic operator."
  [x]
  (if (boolean? x)
    (if x 1 0)
    x))

(defn- op
  "Converts a Clojure binary function f to a C-style operator that treats Booleans as integers, and returns an integer."
  [f]
  (fn [x y] (to-int (f (to-int x) (to-int y)))))

(defn- tag-fns
  "Functions to use for each tag in the parse tree, when transforming the tree into a single value."
  [n]
  {:add-expr  (op +)
   :sub-expr  (op -)
   :mult-expr (op *)
   :div-expr  (op /)
   :mod-expr  (op mod)
   :eq-expr   (op =)
   :neq-expr  (op not=)
   :gt-expr   (op >)
   :gte-expr  (op >=)
   :lt-expr   (op <)
   :lte-expr  (op <=)
   :and-expr  #(to-int (and (to-bool %1) (to-bool %2)))
   :or-expr   #(to-int (or (to-bool %1) (to-bool %2)))
   :ternary   #(to-int (if (to-bool %1) %2 %3))
   :integer   #(Integer. ^String %)
   :variable  (constantly n)
   :expr      identity})

(def index
  "Returns the index of the correct translated string for a given value n, based on the value of the Plural-Forms header
  for a locale.

  Memoized to improve performance for cases where a single string is translated with a limited range of possible
  values of `n` (e.g. \"{0} months\"). However, in some cases, a string may be translated with a unique value of `n` in
  every lookup (e.g. \"{0} rows\"). Each distinct value of `n` would take up space in the cache with very little
  benefit, and if many of these translations are requested at once, they would take up the entire cache. Therefore,
  we use a least-used eviction policy to ensure that common values of `n` remain in the cache over time."
  (memoize/lu
   (fn [plural-forms-header n]
     (let [formula (second (re-find #"plural=(.*)" plural-forms-header))
           tree    (insta/parse plural-form-parser formula)]
       (insta/transform (tag-fns n) tree)))
   {}
   ;; This cache size is pretty arbitrary; can be tweaked if necessary
   :lu/threshold 500))

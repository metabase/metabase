(ns dev.malli
  (:require [malli.core :as mc]
            [malli.error :as me]
            [malli.generator :as mg]
            [malli.provider :as mp]
            [malli.transform :as mtx]
            [malli.util :as mut]
            [metabase.test :as mt]
            [metabase.util.malli :as mu]
            [metabase.util.malli.describe :as umd]
            [metabase.util.malli.schema :as ms]
            [toucan2.core :as t2]))

(comment
  ;; Make a snippet of this to use when hacking with schemas:

  #_:clj-kondo/ignore ;;nocommit
  (require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
           '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
           '[malli.transform :as mtx])

  )

;; # Malli Docs
;; Malli is a data validation and specification library for Clojure(Script).
;;
;; You can do a lot with Malli, but here are some of the main things:
;; - Define schemas for your data with hiccupy Clojure data-structures
;; - Validate data against those schemas with `mc/validate`
;; - Explain why data is invalid with `mc/explain`
;; - Generate random data that conforms to those schemas with `mg/generate`
;;   - Create a test check generator with `mg/generator`
;; - Transform data into a canonical form with `malli.transform`
;; - Extend Malli with custom schema types in `metabase.util.malli.schema` and elsewhere
;; - Describe schemas in a human-readable way with `umd/describe`

;; ## Schemas
;; Schemas are the core of Malli. They define the structure of your data.
;; Malli provides a number of built-in schema types, and you can also define your own custom schema types.
;; Here are some examples of built-in schema types:
;; - `:int` - an integer
;; - `:string` - a string
;; - `:map` - a map
;; - `:tuple` - a tuple
;; - `:enum` - an enumeration
;; - `:and` - a combination of multiple schemas
;; - `:or` - a choice between multiple schemas
;; - `:multi` - a schema that can be one of multiple types
;; - `:inst` - a timestamp
;; - `:email` - an email address
;; - `:url` - a URL
;; - `:keyword` - a keyword
;; - `:boolean` - a boolean
;; - `:nil` - nil
;; - `:coll` - a collection
;; - `:vector` - a vector
;; - `:set` - a set
;; - `:sequential` - a seq of something
;; - `:tuple` - a fixed-length, heterogeneous collection
;;
;;
;; We have a few custom schema types in Metabase. They're mostly vanilla schemas annotated with error messages to be used by our API layer, but we can put any data we want in them.
;;
;; Here are some examples of custom schema types:

(mc/validate ms/BooleanValue false)
;; => true

(mc/validate ms/BooleanValue 2)
;; => false

(mc/validate ms/PositiveInt -1)
;; => false

;; ## Validation
;;
;; Malli provides a number of functions for validating data against schemas.
;; Here are some examples:
;; - `malli.core/validate` - validate data against a schema

(mc/validate :int 1)
;; => true

;; assert will throw, or return the value:

(mc/assert :int 1)
;; => 1

(try (mc/assert :int "not an int")
     (catch Exception e (ex-data e)))

;; also prints:
;; -- Schema Error ------------------------------------------- NO_SOURCE_FILE:87 --
;;
;; Value:
;;
;;   "not an int"
;;
;; Errors:
;;
;;   ["should be an integer"]
;;
;; Schema:
;;
;;   :int
;;
;; More information:
;;
;;   https://cljdoc.org/d/metosin/malli/CURRENT
;;
;; --------------------------------------------------------------------------------

(mc/assert ms/PositiveInt 1)

;; ## Generation
;;
;;  Malli provides a number of functions for generating random data that conforms to schemas. It's great to use when
;;  building a schema, because you can have it generate random data and see that it conforms to the schema in your
;;  head.
;;  Here are some examples:


;;; ### Generating scalars:
(mg/generate :int)
;; => 34

(mg/generate :boolean)
;; => false

(mg/generate [:or :int :string])
;; => -1713124

(mg/generate [:enum :left :right])
;; => :left

;;; ### Generating maps:

(mg/generate [:map [:a :int] [:b :string]])
;; => {:a -1, :b "aEKUgBqXop"}

;;; ### Generating sequences:

(mg/generate [:sequential :int])
;; => [-44971 -49451 -50 -444185161 -1 -298 -2 133027287 -319 -1 340575216 58 -33 -12 -267328666 130404 -52261 -330386
;;     -29770 -241298 -3903979 12498718 213279 -9636714 -1 216 -1]
;; => [-200996630]
;; => [15509387 -19611096 -12164656 42892 476216 2536 3514 194075784 -119 395 5460693 -15 2983704 1410 -2617 -39274550]

(mg/generate [:sequential [:enum :left :right]])
;; => [:left :left :left :right :left]

;; ### Generating tuples:

(mg/generate [:tuple :int :string :boolean])
;; => [-1 "4K3fnHAFn5xQ4YV" true]
;; => [-81255 "3k5W65yXc82vCz6j62xp7l" false]


;; ### Using a seed
;;
;; Up until now, your repl output wouldn't match mine. we can change that by using `:seed.`

(mg/generate :int {:seed 1})
;; => 909

;; ### Using a size
;;
;; Size can be used to control the "complexity" of the generated data. It's useful for generating simple or more
;; complicated examples.

(count (mg/generate [:sequential :int] {:seed 1 :size 2}))
;; => 2

(count (mg/generate [:sequential :int] {:seed 10 :size 20000}))
;; => 2619


;; ### Human friendly descriptions
;;
(umd/describe [:sequential :int])
;; => "sequence of integer"

(umd/describe [:sequential [:map [:x [:sequential :int]]]])
;; => "sequence of map where {:x -> <sequence of integer>}"

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; ## Intermediate Generators: generating a permissions graph ;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(require '[toucan2.core :as t2])

(set! *warn-on-reflection* true)

(defn- rand-pk-for-model
  ([model]
   (rand-nth (t2/select-pks-vec model)))
  ([model & {:keys [seed]}]
   (let [pks (t2/select-pks-vec model)]
     (prn pks)
     (nth pks (rem (Math/abs ^long seed) (count pks))))))

(defn default-id-for-model [model]
  ;; output mapped from input:
  [:int {:gen/fmap (fn [n] (#'rand-pk-for-model model :seed n))}])

(def ^:private db-id (default-id-for-model :model/Database))
(def ^:private user-id (default-id-for-model :model/User))
(def ^:private group-id (default-id-for-model :model/PermissionsGroup))

(defn- default-ids-for-model [model]
  [:set
   {:gen/fmap
    ;; Notice: we use the size of the input to determine the size of the output.
    ;; This makes shrinking with test.check work way better.
    (fn [in]
      (loop [n (count in) acc #{}]
        (if (zero? n)
          acc
          (recur
           (dec n)
           (conj acc (#'rand-pk-for-model model))))))}
   :int])

(def ^:private db-ids (default-ids-for-model :model/Database))
(def ^:private user-ids (default-ids-for-model :model/User))
(def ^:private group-ids (default-ids-for-model :model/PermissionsGroup))

;; These generate model id or ids, that match what is in the database^. I havn't used them yet, but they are here for
;; when we need them.

(require '[clojure.test.check.clojure-test :as ct :refer [defspec]]
         '[clojure.test.check.generators :as gen]
         '[clojure.test.check.properties :as prop]
         '[clojure.test.check :as tc]
         '[clojure.test :refer :all])


;; This should fail, which indicates that the generator CAN find all values currently in the database.
(mt/with-temp [:model/User {the-user-id :id} {}]
  (tc/quick-check 1000
    (prop/for-all [n (mg/generator user-id)]
      (not= n the-user-id))))
;=> {:fail [464],
;;   :failed-after-ms 16,
;;   :failing-size 29,
;;   :num-tests 30,
;;   :pass? false,
;;   :result false,
;;   :result-data nil,
;;   :seed 1711141620793,
;;   :shrunk {...}}

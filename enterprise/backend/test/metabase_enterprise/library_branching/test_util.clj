(ns metabase-enterprise.library-branching.test-util
  "test.check generators of snapshots, and predicates of the structural rules that they obey.

  Every generator is one `gen/fmap` over a vector of random choices, one per item, folded into a snapshot by a pure
  function. The generators filter nothing and retry nothing, and test.check shrinks the choices directly: a shrunk
  snapshot has fewer items, items at the root level, and the first kind."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.util :as u])
  (:import
   (java.text Normalizer Normalizer$Form)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Structural rules -------------------------------------------------

(defn env-target?
  "True iff ref target `target` names an environment object (`[:env natural-key]`)."
  [target]
  (and (vector? target) (= :env (first target))))

(defn places-inside?
  "True iff the place of every item of snapshot `s` is nil or an identity of `s`."
  [s]
  (every? (fn [{:keys [place]}] (or (nil? place) (contains? s place))) (vals s)))

(defn- on-cycle?
  [s id]
  (loop [at (:place (get s id)), steps (count s)]
    (cond
      (= at id)                          true
      (or (nil? at) (not (contains? s at))
          (zero? steps))                 false
      :else                              (recur (:place (get s at)) (dec steps)))))

(defn acyclic?
  "True iff no item of snapshot `s` contains itself through the chain of its places."
  [s]
  (not-any? (partial on-cycle? s) (keys s)))

(defn kinds-fit?
  "True iff, for every item of snapshot `s` whose place is in `s`, `may-contain` of the container's kind holds the
  item's kind. `may-contain` defaults to [[snapshot/may-contain]]."
  ([s] (kinds-fit? s snapshot/may-contain))
  ([s may-contain]
   (every? (fn [{:keys [kind place]}]
             (if-let [container (get s place)]
               (contains? (get may-contain (:kind container) #{}) kind)
               true))
           (vals s))))

(defn refs-closed?
  "True iff every reference target of snapshot `s` is an identity of `s` or names an environment object."
  [s]
  (every? (fn [[_role target]] (or (env-target? target) (contains? s target)))
          (mapcat :refs (vals s))))

(defn unique-keys?
  "True iff no two items of snapshot `s` of one kind of `unique-keys` (in the form of [[snapshot/unique-keys]], its
  default) have one non-nil key ([[snapshot/unique-key]])."
  ([s] (unique-keys? s snapshot/unique-keys))
  ([s unique-keys]
   (let [ks (keep (fn [{:keys [kind] :as item}]
                    (some->> (snapshot/unique-key unique-keys item) (vector kind)))
                  (vals s))]
     (= (count ks) (count (set ks))))))

(defn namespaces-fit?
  "True iff every collection of snapshot `s` whose container is a collection of `s` has the `:namespace` attribute of
  its container: both absent, or equal."
  [s]
  (every? (fn [{:keys [kind place attrs]}]
            (let [container (get s place)]
              (or (not= :collection kind)
                  (not= :collection (:kind container))
                  (= (:namespace attrs) (:namespace (:attrs container))))))
          (vals s)))

(defn ref-kinds-fit?
  "True iff, for every item of snapshot `s` and each of its references `[role target]` for which `ref-kinds`
  (`{kind {role #{kind}}}`; default [[snapshot/ref-kinds]]) gives kinds, `target` is not in `s` or is an item of one of
  those kinds. An environment target is no item, so it does not fit."
  ([s] (ref-kinds-fit? s snapshot/ref-kinds))
  ([s ref-kinds]
   (every? (fn [{:keys [kind refs]}]
             (every? (fn [[role target]]
                       (if-let [allowed (get-in ref-kinds [kind role])]
                         (cond
                           (env-target? target)     false
                           (contains? s target)     (contains? allowed (:kind (get s target)))
                           :else                    true)
                         true))
                     refs))
           (vals s))))

(defn nested-ids-unique?
  "True iff no two items of snapshot `s` of one kind hold a nested entry with one identity
  ([[snapshot/nested-identities]])."
  [s]
  (let [ks (mapcat (fn [{:keys [kind] :as item}]
                     (map (partial vector kind) (distinct (snapshot/nested-identities snapshot/nested-ids item))))
                   (vals s))]
    (= (count ks) (count (set ks)))))

(defn well-formed?
  "True iff snapshot `s` obeys the structural rules of `specs/Structure.als` `wf` and `uniqueKeys`:
  [[places-inside?]], [[acyclic?]], [[kinds-fit?]], [[refs-closed?]] and [[unique-keys?]]; and the three rules that
  the model does not have: [[namespaces-fit?]], [[ref-kinds-fit?]] and [[nested-ids-unique?]]."
  ([s] (well-formed? s snapshot/may-contain))
  ([s may-contain]
   (and (places-inside? s) (acyclic? s) (kinds-fit? s may-contain) (refs-closed? s)
        (unique-keys? s) (namespaces-fit? s) (ref-kinds-fit? s) (nested-ids-unique? s))))

;;; --------------------------------------------- Identities and values ----------------------------------------------

(def ^:private nano-id-chars
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

(defn- index-code
  "Five characters of `nano-id-chars` that encode `n`, for 0 <= n < 64^5."
  [n]
  (apply str (for [shift [24 18 12 6 0]]
               (nth nano-id-chars (bit-and (bit-shift-right n shift) 63)))))

(def ^:private entity-id-prefix
  (gen/fmap str/join (gen/vector (gen/elements nano-id-chars) 16)))

(def ^:private item-id-prefix
  "The prefix of the identity of a generated item: mostly random, and now and then one of a small pool, so that two
  snapshots of one generator share identities, also for items of two kinds."
  (gen/frequency [[3 entity-id-prefix]
                  [1 (gen/elements ["AAAAAAAAAAAAAAAA" "BBBBBBBBBBBBBBBB"])]]))

(defn- entity-id
  "A 21-character entity id: `prefix` (16 characters) and the code of `n`. Ids with different `n` are different."
  [prefix n]
  (str prefix (index-code n)))

(def entity-id-gen
  "Generates an entity id string (21 characters of the NanoID alphabet)."
  (gen/fmap (fn [[prefix n]] (entity-id prefix n)) (gen/tuple entity-id-prefix (gen/choose 0 1000000))))

(def ^:private database-names ["Sample Database" "Aviary"])
(def ^:private schema-names   [nil "PUBLIC" "BIRDS"])
(def ^:private table-names    ["ORDERS" "PEOPLE" "SIGHTINGS" "NESTS"])
(def ^:private field-names    ["ID" "TOTAL" "SPECIES" "WINGSPAN"])

(def table-key-gen
  "Generates the natural key of a table: `[database schema table]`, where schema can be nil."
  (gen/tuple (gen/elements database-names) (gen/elements schema-names) (gen/elements table-names)))

(def env-key-gen
  "Generates the natural key of an environment table or field."
  (gen/one-of [table-key-gen
               (gen/fmap (fn [[k field]] (conj k field)) (gen/tuple table-key-gen (gen/elements field-names)))]))

(def name-gen
  "Generates a non-empty name. Names repeat often, so siblings with one name and one kind occur, and so do names that
  differ only in case, in accents, or as ß and ss."
  (gen/frequency [[4 (gen/elements ["Robin" "Toucan" "Heron" "Wren" "robin" "Wrén" "Straße" "Strasse"])]
                  [1 (gen/fmap (fn [[c s]] (str c s)) (gen/tuple gen/char gen/string))]]))

(defn code-points->string
  "The string of the Unicode code points `code-points`."
  ^String [code-points]
  (let [a (int-array code-points)]
    (String. a 0 (alength a))))

(def ^:private special-code-points
  "Code points where a fold by case and accents alone differs from utf8mb4_unicode_ci: expansions, final sigma, spaces,
  ignorable characters and noncharacters."
  (mapv int "ßẞςσΣŒœÆæﬁĲ\u00A0\u2002\u3000\u200B\u200D\u00AD\uFEFF\u0000\uFFFD\uFFFF"))

(def ^:private code-point-gen
  "Generates a Unicode scalar value (no surrogate), mostly ASCII and Latin letters, combining marks and
  [[special-code-points]]."
  (gen/frequency [[6 (gen/fmap int (gen/elements "aAbBsSeEoOiI0_ -"))]
                  [3 (gen/choose 0xC0 0x24F)]
                  [2 (gen/choose 0x300 0x36F)]
                  [3 (gen/elements special-code-points)]
                  [3 (gen/fmap #(if (< % 0xD800) % (+ % 0x800)) (gen/choose 0 0xF7FF))]
                  [1 (gen/choose 0x10000 0x10FFFF)]]))

(def unicode-name-gen
  "Generates a name of 1 to 8 Unicode scalar values from any plane."
  (gen/fmap code-points->string (gen/vector code-point-gen 1 8)))

(defn- variant
  "A string that utf8mb4_unicode_ci likely takes as equal to code point `cp`, by `how`."
  ^String [cp how]
  (let [s (String. (Character/toChars (int cp)))]
    (case how
      :same          s
      :upper         (u/upper-case-en s)
      :lower         (u/lower-case-en s)
      :nfd           (Normalizer/normalize s Normalizer$Form/NFD)
      :nfkc          (Normalizer/normalize s Normalizer$Form/NFKC)
      :ignorable     (str "\u200B" s)
      :supplementary (if (Character/isSupplementaryCodePoint (int cp)) "🦄" s))))

(def ^:private small-alphabet
  (into (mapv int "sSßaAáeEœŒoOσς \u200B") [0x1F600 0x1F603]))

(def unicode-name-pair-gen
  "Generates `[a b]`, two names that utf8mb4_unicode_ci often takes as equal: b is a with each code point changed in
  case, normal form or supplementary character, or after an ignorable character, then trailing spaces; or both are
  short names of a small alphabet."
  (gen/one-of
   [(gen/fmap (fn [[changes pad]]
                [(code-points->string (map first changes))
                 (str (str/join (map (fn [[cp how]] (variant cp how)) changes)) pad)])
              (gen/tuple (gen/vector (gen/tuple code-point-gen
                                                (gen/elements [:same :upper :lower :nfd :nfkc :ignorable :supplementary]))
                                     1 8)
                         (gen/elements ["" " " "  " "\u00A0" " \u3000"])))
    (gen/fmap (fn [[a b]] [(code-points->string a) (code-points->string b)])
              (gen/tuple (gen/vector (gen/elements small-alphabet) 1 4)
                         (gen/vector (gen/elements small-alphabet) 1 4)))]))

(def ^:private role-gen (gen/elements [:card :snippet :source-table :field]))

(def ^:private attr-key-gen (gen/elements [:description :display :position :settings :color]))

(def attrs-gen
  "Generates an `:attrs` map: keyword keys, and values of strings, integers, booleans, vectors and maps."
  (let [scalar (gen/one-of [gen/string-alphanumeric gen/large-integer gen/boolean])
        value  (gen/scale #(min % 4)
                          (gen/recursive-gen
                           (fn [inner]
                             (gen/one-of [(gen/vector inner 0 3)
                                          (gen/fmap #(into {} %) (gen/vector (gen/tuple attr-key-gen inner) 0 3))]))
                           scalar))]
    (gen/fmap #(into {} %) (gen/vector (gen/tuple attr-key-gen value) 0 3))))

;;; --------------------------------------------------- Folding ------------------------------------------------------

(defn- unique-table-keys
  "Gives each index of `table-indices` its key from `choices`, with `_<i>` added to the table name until it is unique."
  [choices table-indices]
  (first
   (reduce (fn [[ids seen] i]
             (let [k (loop [[db schema table :as k] (:table (nth choices i))]
                       (if (contains? seen k) (recur [db schema (str table "_" i)]) k))]
               [(assoc ids i k) (conj seen k)]))
           [{} #{}]
           table-indices)))

(defn- identities
  "`[identity]` by index: a table key for a published table, an entity id for every other kind."
  [choices item-kinds]
  (let [tables (unique-table-keys choices (filter #(= :published-table (nth item-kinds %)) (range (count choices))))]
    (mapv (fn [i] (or (get tables i) (entity-id (:id (nth choices i)) i))) (range (count choices)))))

(defn- dangling-id
  "An entity id that no item of a snapshot of `n` items has."
  [prefix n k]
  (entity-id prefix (+ n k)))

(defn- resolve-target
  [ids prefix [tag x]]
  (case tag
    :item     (nth ids (mod x (count ids)))
    :env      [:env x]
    :dangling (dangling-id prefix (count ids) x)))

(defn- assemble
  "The snapshot of `choices`, given the kind and the place (an `[:item k]` or `[:dangling k]` choice, or nil) of each
  item."
  [choices item-kinds item-places]
  (let [ids (identities choices item-kinds)]
    (into {}
          (map-indexed
           (fn [i {:keys [id name refs attrs]}]
             (let [kind (nth item-kinds i)]
               [(nth ids i)
                {:kind  kind
                 :name  name
                 :place (some->> (nth item-places i) (resolve-target ids id))
                 :refs  (into #{} (map (fn [[role target]] [role (resolve-target ids id target)])) refs)
                 :attrs (get attrs kind)}])))
          choices)))

(defn- sorted-kinds [ks] (vec (sort ks)))

(defn- with-unique-keys
  "Snapshot `s` in which each string key of `unique-keys` (in the form of [[snapshot/unique-keys]]) that an item of the
  same kind and a lesser identity has ([[snapshot/unique-key]]) gets `_<n>` appended, with the least `n` that makes it
  unique."
  [unique-keys s]
  (first
   (reduce (fn [[s seen] id]
             (let [{:keys [kind] :as item} (get s id)
                   path                    (get-in unique-keys [kind :path])
                   k                       (some->> path (get-in item))
                   key-of                  #(snapshot/unique-key unique-keys (assoc-in item path %))]
               (if (string? k)
                 (let [k (first (remove #(seen [kind (key-of %)]) (cons k (map #(str k "_" %) (range)))))]
                   [(assoc-in s (cons id path) k) (conj seen [kind (key-of k)])])
                 [s seen])))
           [s #{}]
           (sort snapshot/compare-identities (keys s)))))

(defn- well-formed-structure
  "`[item-kinds item-places]`. Item i has its place at the root level or in an item before it whose kind can contain
  a kind of `kinds`; then its kind is one that the place allows. So places are inside, acyclic, and kinds fit."
  [{:keys [kinds may-contain root-kinds]} choices]
  (let [contained (fn [kind] (sorted-kinds (set/intersection (set (get may-contain kind)) (set kinds))))
        roots     (sorted-kinds root-kinds)]
    (reduce (fn [[item-kinds item-places] {:keys [place kind]}]
              ;; The newest container first: a small choice names a recent container, also after a shrink removes
              ;; an older one.
              (let [containers (filterv #(seq (contained (nth item-kinds %))) (reverse (range (count item-kinds))))
                    candidates (cond->> containers (seq roots) (into [nil]))
                    container  (nth candidates (min place (dec (count candidates))))
                    allowed    (if container (contained (nth item-kinds container)) roots)]
                [(conj item-kinds (nth allowed (mod kind (count allowed))))
                 (conj item-places (some->> container (vector :item)))]))
            [[] []]
            choices)))

(defn- item-choice-gen
  [{:keys [kinds attrs]} place-gen target-gen]
  (gen/hash-map :place place-gen
                :kind  gen/nat
                :id    item-id-prefix
                :table table-key-gen
                :name  name-gen
                :refs  (gen/vector (gen/tuple role-gen target-gen) 0 3)
                :attrs (apply gen/hash-map (mapcat (fn [kind] [kind (attrs kind)]) (sorted-kinds kinds)))))

(defn- choices-gen
  [{:keys [max-items] :as opts} place-gen target-gen]
  (gen/sized (fn [size]
               (gen/vector (item-choice-gen opts place-gen target-gen) 0 (min size max-items)))))

(def ^:private default-options
  {:kinds       snapshot/kinds
   :may-contain snapshot/may-contain
   :root-kinds  snapshot/kinds
   :unique-keys snapshot/unique-keys
   :attrs       (constantly attrs-gen)
   :max-items   50})

(def ^:private item-target-gen
  (gen/one-of [(gen/tuple (gen/return :item) gen/nat)
               (gen/tuple (gen/return :env) env-key-gen)]))

(def ^:private place-choice-gen
  ;; Mostly a small choice: the root level or one of the newest containers, so chains of containment are long also
  ;; when a container can hold many kinds. A larger choice saturates at the oldest container.
  (gen/frequency [[2 (gen/choose 0 3)] [1 gen/nat]]))

;;; -------------------------------------------------- Generators ----------------------------------------------------

(defn well-formed-snapshot-gen
  "Generates snapshots that satisfy [[well-formed?]] with `:may-contain`, by construction. A snapshot has at most
  min(size, `:max-items`) items. Every root-level item has a kind of `:root-kinds`. A published table's identity is a
  table natural key; every other identity is an entity id. Two snapshots of the generator share identities now and
  then, also for items of two kinds. Siblings with one name and one kind occur, but no two items of a kind of
  `:unique-keys` have one key. With the default options, every snapshot validates against
  `::snapshot/snapshot` and satisfies [[well-formed?]].

  Options, each with a default:
  - `:kinds` (a set of kinds; [[snapshot/kinds]]);
  - `:may-contain` (`{kind #{kind}}`; [[snapshot/may-contain]]);
  - `:root-kinds` (a non-empty subset of `:kinds`; all of `:kinds`);
  - `:unique-keys` (in the form of [[snapshot/unique-keys]], with a path to a string key; [[snapshot/unique-keys]]);
  - `:attrs` (a function from a kind to a generator of its `:attrs`; [[attrs-gen]] for each kind);
  - `:max-items` (50)."
  ([] (well-formed-snapshot-gen {}))
  ([opts]
   (let [opts (merge default-options opts)]
     (assert (seq (:root-kinds opts)) "`:root-kinds` must not be empty")
     (assert (set/subset? (set (:root-kinds opts)) (set (:kinds opts))) "`:root-kinds` must be a subset of `:kinds`")
     (gen/fmap (fn [choices]
                 (let [[item-kinds item-places] (well-formed-structure opts choices)]
                   (with-unique-keys (:unique-keys opts) (assemble choices item-kinds item-places))))
               (choices-gen opts place-choice-gen item-target-gen)))))

(defn arbitrary-snapshot-gen
  "Generates snapshots with no structural guarantee: a place or a reference can name an identity that is not in the
  snapshot, places can form cycles, and any kind can be in any container. A snapshot has at most min(size,
  `:max-items`) items. With the default options, every snapshot validates against `::snapshot/snapshot`.

  Options: `:kinds`, `:attrs` and `:max-items`, as for [[well-formed-snapshot-gen]]."
  ([] (arbitrary-snapshot-gen {}))
  ([opts]
   (let [opts       (merge default-options opts)
         kinds      (sorted-kinds (:kinds opts))
         ref-gen    (gen/frequency [[2 (gen/tuple (gen/return :item) gen/nat)]
                                    [1 (gen/tuple (gen/return :env) env-key-gen)]
                                    [1 (gen/tuple (gen/return :dangling) gen/nat)]])
         place-gen  (gen/frequency [[1 (gen/return nil)]
                                    [4 (gen/tuple (gen/return :item) gen/nat)]
                                    [1 (gen/tuple (gen/return :dangling) gen/nat)]])]
     (gen/fmap (fn [choices]
                 (assemble choices
                           (mapv #(nth kinds (mod (:kind %) (count kinds))) choices)
                           (mapv :place choices)))
               (choices-gen opts place-gen ref-gen)))))

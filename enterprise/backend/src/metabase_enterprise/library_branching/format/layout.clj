(ns metabase-enterprise.library-branching.format.layout
  "The layout: the path of each item of a snapshot, a pure function of the snapshot. Paths are for a person who
  looks for a file; decode never reads them.

  A directory kind (a collection) is a directory with its own file `_<word>.yaml`; the items it contains are in that
  directory. An item of another kind is the file `<name>.<word>.yaml`; the items it contains are in the directory
  `<name>.<word>/` next to it. A root-level item, and an item whose place is an area root (`snapshot/area-roots`),
  sits where its kind's [[home]] says. `<name>` is the [[slug]] of the item's name. Siblings with one entry name (one
  slug, and one word for a file kind): the least identity keeps the plain name; each other one gets `~<identity>` after
  the slug."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.snapshot :as snapshot])
  (:import
   (java.nio.charset StandardCharsets)
   (java.text Normalizer Normalizer$Form)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(defprotocol Layout
  "The layout data of one kind. A codec implements it next to `codec/Codec`."
  (word [codec]
    "The kind word in file names: lower-case letters, digits and -, not \"yaml\".")
  (directory? [codec]
    "True iff an item of this kind is a directory that holds its own file `_<word>.yaml` and the items it contains.")
  (home [codec item]
    "Where `item` sits when it is at the root level or at an area root: `{:dir segments}`, and optionally `:segment`,
    a fixed name in place of the slug of the item's name. An item at the repository root (`:dir []`) has a
    `:segment`. A `:dir` segment is lower-case letters, digits, _ and -; a `:segment` is the same and does not start
    with _."))

;;; ------------------------------------------------------- Slugs ------------------------------------------------------

(def ^:private max-slug-length 100)

(def ^:private windows-device-names
  (into #{"con" "prn" "aux" "nul"}
        (for [prefix ["com" "lpt"], n ["1" "2" "3" "4" "5" "6" "7" "8" "9" "¹" "²" "³"]]
          (str prefix n))))

(defn slug-char
  "Code point `cp` in a slug: itself for a letter, a digit, _ or -; else _."
  [^long cp]
  (if (or (Character/isLetterOrDigit cp) (= cp (int \_)) (= cp (int \-)))
    cp
    (int \_)))

(defn slug
  "The file-name form of `name`: lower case, Unicode NFC, each character that is not a letter, a digit, _ or - as _,
  at most 100 characters; then a _ before a leading _, so a slug never equals a fixed directory as `_tags`, and a _
  after a Windows device name. Never empty; never has a dot, a / or a ~."
  ^String [^String name]
  (let [s       name
        s       (.toLowerCase s Locale/ROOT)
        s       (Normalizer/normalize s Normalizer$Form/NFC)
        sb      (StringBuilder.)
        _       (doseq [cp (take max-slug-length (.toArray (.codePoints s)))]
                  (.appendCodePoint sb (int (slug-char cp))))
        cut     (if (zero? (.length sb)) "_" (str sb))
        escaped (if (str/starts-with? cut "_") (str "_" cut) cut)]
    (if (windows-device-names escaped) (str escaped "_") escaped)))

(defn- escape-part
  "`s` with each byte of its UTF-8 form that is not an ASCII letter, a digit, _ or - as %XX."
  ^String [^String s]
  (let [sb (StringBuilder.)]
    (doseq [b (.getBytes s StandardCharsets/UTF_8)]
      (let [x (bit-and b 0xff)]
        (if (or (<= 48 x 57) (<= 65 x 90) (<= 97 x 122) (= x 95) (= x 45))
          (.append sb (char x))
          (.append sb (format "%%%02X" x)))))
    (str sb)))

(defn identity-segment
  "The file-name form of identity `id`, with no dot, / or ~ but for nil: an entity id as it is; a natural key as
  `+<part>+<part>...`, each part escaped as %XX and nil as ~. Injective. The order of these strings orders
  identities for the suffix rule."
  ^String [id]
  (if (string? id)
    (escape-part id)
    (apply str (map (fn [part] (str "+" (if (nil? part) "~" (escape-part part)))) id))))

;;; ------------------------------------------------------ Layout ------------------------------------------------------

(defn- invalid-layout!
  [message data]
  (throw (ex-info message data)))

(defn- check-word!
  [codec]
  (let [w (word codec)]
    (when-not (and (string? w) (re-matches #"[a-z0-9][a-z0-9-]*" w) (not= "yaml" w))
      (invalid-layout! (str "The word of the kind " (codec/kind codec) " is not a safe file-name part: " (pr-str w))
                       {:kind (codec/kind codec) :word w}))))

(defn- checked-home
  [codec item]
  (let [{:keys [dir segment] :as h} (home codec item)]
    (when-not (and (vector? dir)
                   (every? #(and (string? %) (re-matches #"[a-z0-9_-]+" %)) dir)
                   (if (some? segment)
                     (and (string? segment) (re-matches #"[a-z0-9-][a-z0-9_-]*" segment))
                     (seq dir)))
      (invalid-layout! (str "The home of a root-level item of the kind " (codec/kind codec) " is not safe: " (pr-str h))
                       {:kind (codec/kind codec) :home h}))
    h))

(defn- at-home?
  "True iff an item of snapshot `s` with the place `place` sits at the home of its kind: `place` is nil, or names an
  area root and no item of `s`."
  [s place]
  (or (nil? place)
      (and (not (contains? s place)) (contains? snapshot/area-roots place))))

(defn- depths
  "`{id n}`: the number of directory segments above the entry of each item of snapshot `s`. Throws when a place is
  not in `s` or when places form a cycle."
  [s home-of]
  (reduce (fn [acc id]
            (loop [chain [id], acc acc]
              (let [at (peek chain)]
                (if (contains? acc at)
                  (reduce (fn [acc [child parent]] (assoc acc child (inc (get acc parent))))
                          acc
                          (reverse (partition 2 1 chain)))
                  (let [{:keys [place] :as item} (get s at)]
                    (cond
                      (at-home? s place)
                      (recur chain (assoc acc at (count (:dir (home-of item)))))

                      (not (contains? s place))
                      (invalid-layout! "A place is not in the snapshot." {:id at :place place})

                      (some #{place} chain)
                      (invalid-layout! "Places form a containment cycle." {:ids (conj chain place)})

                      :else
                      (recur (conj chain place) acc)))))))
          {}
          (keys s)))

(defn parent-dir
  "The directory segments that hold the entry of `item` of snapshot `s`: its container's own directory, or its home
  at the root level or at an area root. `dirs` maps each container to its own directory."
  [s dirs home-of {:keys [place] :as item}]
  (if (at-home? s place) (:dir (home-of item)) (get dirs place)))

(defn entries
  "`{id entry}`: the entry name of each item of `items` in its directory. An item is a map with `:id`, `:dir`,
  `:base`, `:word`, `:directory?` and `:entry`, the entry with no suffix. Of the items with one `:dir` and one `:entry`,
  the least [[identity-segment]] keeps `:entry`; each other one gets `~<identity>` after its base. An item whose entry
  is not free (`(free? item entry)`, default always true) takes the first free one of `~<identity>`, `~<identity>~2`,
  `~<identity>~3`, and so on."
  ([items]
   (entries items (constantly true)))
  ([items free?]
   (into {}
         (mapcat (fn [group]
                   (let [[least & others] (sort-by (comp identity-segment :id) group)]
                     (for [{:keys [id base word directory?] :as item} (cons least others)
                           :let [suffixed (fn [n]
                                            (cond-> (str (str base "~" (identity-segment id)) (when (< 1 n) (str "~" n)))
                                              (not directory?) (str "." word)))]]
                       [id (first (filter #(free? item %)
                                          (concat (when (identical? item least) [(:entry item)])
                                                  (map suffixed (iterate inc 1)))))]))))
         (vals (group-by (juxt :dir :entry) items)))))

(defn- dir-prefixes
  "The directories of path `p`: each proper prefix that ends before a /."
  [^String p]
  (let [segments (str/split p #"/")]
    (map #(str/join "/" (take % segments)) (range 1 (count segments)))))

(defn- free-entry?
  "`(free? item entry)` for [[entries]]: true iff entry `entry` of `item` puts its file and its own directory at no
  path of `taken`, and its file at no directory of a path of `taken`."
  [taken]
  (if (empty? taken)
    (constantly true)
    (let [taken-dirs (into #{} (mapcat dir-prefixes) taken)]
      (fn [{:keys [dir word directory?]} entry]
        (let [own  (str/join "/" (conj dir entry))
              file (if directory? (str own "/_" word ".yaml") (str own ".yaml"))]
          (not (or (contains? taken own) (contains? taken file) (contains? taken-dirs file))))))))

(defn layout
  "`{identity path}` of snapshot `s`, with the codecs `codecs` (each a `codec/Codec` and a [[Layout]]). Paths are
  relative, separated by /, unique, and end in .yaml; no path is a directory of another. Throws when a kind of `s` has
  no codec, when a place is neither in `s` nor an area root, when places form a cycle, or when a codec gives an unsafe
  word or home.

  `taken` is a set of paths of files that sync does not write (the foreign files of a tree). An item whose file or
  own directory would be at one of them, or whose file would be at one of their directories, gets a suffix
  ([[entries]]); the items that it contains move with it. A home directory takes no suffix."
  ([codecs s]
   (layout codecs s #{}))
  ([codecs s taken]
   (let [by-kind  (codec/by-kind codecs)
         _        (run! check-word! (vals by-kind))
         codec-of (fn [kind]
                    (or (get by-kind kind)
                        (invalid-layout! (str "No codec for the kind " kind) {:kind kind})))
         home-of  (fn [item] (checked-home (codec-of (:kind item)) item))
         depth    (depths s home-of)
         levels   (sort (distinct (vals depth)))
         by-level (group-by depth (keys s))]
     (:paths
      (reduce
       (fn [{:keys [dirs] :as acc} level]
         (let [items (for [id (get by-level level)
                           :let [{:keys [kind name place] :as item} (get s id)
                                 c    (codec-of kind)
                                 dir? (boolean (directory? c))
                                 w    (word c)
                                 base (or (when (at-home? s place) (:segment (home-of item))) (slug name))]]
                       {:id id :name name :dir (parent-dir s dirs home-of item) :base base :word w :directory? dir?
                        :entry (if dir? base (str base "." w))})
               named (entries items (free-entry? taken))]
           (reduce (fn [acc {:keys [id dir word directory?]}]
                     (let [entry (get named id)
                           own   (conj dir entry)]
                       (-> acc
                           (assoc-in [:dirs id] own)
                           (assoc-in [:paths id] (str/join "/" (if directory?
                                                                 (conj own (str "_" word ".yaml"))
                                                                 (conj dir (str entry ".yaml"))))))))
                   acc
                   items)))
       {:dirs {} :paths {}}
       levels)))))

(ns metabase.channel.render.pdf.typeset
  "Pure typesetting for the backend dashboard->PDF renderer: turning styled runs into measured, wrapped lines and
  blocks. Nothing here draws to a PDFBox content stream -- everything returns data (word / line / item maps and
  heights) that `metabase.channel.render.pdf` then draws.

  The pipeline is runs -> words ([[runs->words]]) -> measured items ([[->measured-item]]) -> wrapped lines
  ([[words->lines]], via the greedy [[pack-units->lines]]), with RTL word reordering ([[reorder-bidi-items]]) and
  block/line height measurement ([[block-height]], [[fit-scale]])."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [metabase.channel.render.pdf.common :as common]
   [metabase.channel.render.pdf.font :as font])
  (:import
   (com.ibm.icu.text Bidi)
   (java.awt Color)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; Greedy streaming grouping (`segment`)
;;
;; A stateful transducer for greedily "packing" input items into grouped output items; a
;; generalized `partition-by`. Think packing words on a line of text, dashcards into pages, etc.
;;
;; User code (*policy*) is controlled by two (three) functions: opening a new group, including or
;; rejecting a new item in that group, and optionally finalizing each group before it is emitted
;; downstream.
;; --------------------------------------------------------------------------------------------

(defn segment
  "A stateful transducer that greedily groups a stream of items. `collect` is the *policy*, given as two arities,
  and this transducer is the *mechanism* that drives them:

  - `(collect item)` is **open**: start a new group seeded with `item`. Must always succeed, so a group always holds
    at least one item. This guarantees progress - if the item passed to **open** is too big even for a fresh group
    (e.g. a word too long for a line all by itself) then **open** should forcibly split it.
  - `(collect acc item)` is **add**: fold `item` into the open group `acc`. Returns one of three things:
    - An updated `acc`: accepts the new item
    - `::reject`: the new `item` cannot fit! The current group is closed, and `item` is passed to **open** to become
      the first item in a new group.
    - `::break`: `item` represents the end of a group (e.g. a hard line break) and therefore the current group should
      be closed (if any) and `item` *dropped*. The next input item (if any) is used to **open** the next group.

  `close` (default `identity`) realizes a finished accumulator into the emitted value -- e.g. trim and RTL-reorder
  a packed line, or `str` a `StringBuilder`.

  Honors downstream `reduced?` (early termination) and flushes any open group in the transducer's completion step.

  See the tests for reimplementations of [[partition-all]] and [[partition-by]] using `segment`."
  ([collect] (segment collect identity))
  ([collect close]
   (fn [rf]
     (let [state (volatile! ::empty)]
       (fn
         ([] (rf))
         ([result]
          (let [acc @state]
            (vreset! state ::empty)
            (rf (if (= acc ::empty)
                  result
                  (unreduced (rf result (close acc)))))))
         ([result item]
          (let [acc @state]
            (if (= acc ::empty)
              (do (vreset! state (collect item))
                  result)
              (let [r (collect acc item)]
                (case r
                  ::reject (let [result (rf result (close acc))]
                             ;; closed; reopen with `item` -- unless downstream is done, then stop cleanly
                             (vreset! state (if (reduced? result)
                                              ::empty
                                              (collect item)))
                             result)
                  ::break  (do (vreset! state ::empty)
                               (rf result (close acc)))
                  (do (vreset! state r)
                      result)))))))))))

(defn- text->codepoint-items
  "`text` as a seq of `{:cp <codepoint>}` items, one per codepoint (surrogate pairs kept intact) --
  the input stream to the [[runs->words]] pipeline. `.toArray` materialises the codepoint
  `IntStream` into an `int[]` (a `java.util.stream.IntStream` isn't directly reducible)."
  [^String text]
  (into [] (map (fn [cp] {:cp cp}))
        (.toArray (.codePoints text))))

(defn- run-style
  "The style map carried on each piece of a run -- everything but the structural keys, plus `:link?`
  when the run is a hyperlink (so [[run-color]] can colour it)."
  [r]
  (cond-> (dissoc r :text :base :reading :ruby? :space? :break?)
    (:href r) (assoc :link? true)))

(defn- run->items
  "Expand one run into the [[runs->words]] input stream: a `:break?`/`:ruby?` run becomes a single atomic item;
  a text run becomes one `{:cp _ :style _}` item per codepoint, each tagged with the run's style so a
  [[collect-word]] word can carry pieces from more than one run."
  [r]
  (cond
    (:break? r) [{:break? true}]
    (:ruby? r)  [{:ruby? true :base (:base r) :reading (:reading r) :style (run-style r)}]
    :else       (let [style (run-style r)]
                  (map #(assoc % :style style) (text->codepoint-items (str (:text r "")))))))

(defn- mark-space-before
  "Stateful transducer over run items: drops whitespace codepoint items and stamps every surviving item with
  `:space-before?` -- true iff whitespace immediately preceded it.

  Accepts an initial `:space-before?` value, since some contexts start with leading space.

  A `:break?` clears `:space-before?` - it represents a hard line break or similar, and the next unit is therefore
  flush with the start."
  [init-space-before?]
  (fn [rf]
    (let [space-before? (volatile! (boolean init-space-before?))]
      (fn
        ([] (rf))
        ([result] (rf result))
        ([result item]
         (cond
           (and (:cp item) (Character/isWhitespace (int (:cp item))))
           (do (vreset! space-before? true) result)

           (:break? item)
           (do (vreset! space-before? false) (rf result item))

           :else
           (let [sb @space-before?]
             (vreset! space-before? false)
             (rf result (assoc item :space-before? sb)))))))))

(defn- collect-word
  "[[segment]] policy for grouping the run-item stream into break-units (words) that can't break across a line. This
  decides *word* boundaries only: the boundaries are whitespace and CJK char boundaries, NOT style changes, so
  `\"**bo**ld\"` stays one indivisible word. Each CJK character is its own word, except for a few no-break-before
  characters ([[font/no-break-before?]]) which stick onto the end of the open word (kinsoku). `:break?`/`:ruby?` items are
  atomic words. The accumulator just collects the word's raw codepoint items in `:cps` -- splitting them into styled
  `:pieces` is [[close-word]]'s job. `:cjk-unit?` means the word can no longer take an ordinary character."
  ([item]
   (if-let [cp (:cp item)]
     {:space-before? (boolean (:space-before? item))
      :cps           [item]
      :cjk-unit?     (font/cjk-char? (int cp))}
     {:atomic item}))
  ([acc item]
   (cond
     (:atomic acc)    ::reject
     (not (:cp item)) ::reject                          ; a ruby/break can't join a word
     :else
     (let [cp (int (:cp item))]
       (cond
         ;; a no-break-before char glues onto the open word even across a space (kinsoku wins)
         (font/no-break-before? cp) (-> acc (assoc :cjk-unit? true) (update :cps conj item))
         (:space-before? item) ::reject               ; whitespace preceded -> new word
         (font/cjk-char? cp)        ::reject               ; each CJK char is its own word
         (:cjk-unit? acc)      ::reject
         :else                 (update acc :cps conj item))))))

(defn- codepoints->string
  ^String [items]
  (let [sb (StringBuilder.)]
    (doseq [{:keys [cp]} items] (.appendCodePoint sb (int cp)))
    (.toString sb)))

(defn- close-word
  "Realise a [[collect-word]] accumulator into a word token: an atomic `:break?`/`:ruby?` item passes
  through; a char word splits its codepoints into same-style `:pieces` (`partition-by :style` -- the
  one place piece boundaries are decided), each `{:style _ :text _}`."
  [acc]
  (if-let [item (:atomic acc)]
    item
    {:space-before? (:space-before? acc)
     :pieces        (mapv (fn [grp] {:style (:style (first grp)) :text (codepoints->string grp)})
                          (partition-by :style (:cps acc)))}))

(defn- item-codepoint-count
  "Number of codepoints across all of a measured word item's `:pieces`."
  ^long [item]
  (transduce (map (fn [p] (let [^String t (:text p)] (.codePointCount t 0 (.length t)))))
             + 0 (:pieces item)))

(defn- split-into-chars
  "Split an over-wide measured word into one measured item per codepoint (each a single-piece word
  carrying its source piece's font/colour), so the wrapper can break inside it. The first keeps the
  word's `:space-before?`. Used to hard-break a token wider than the whole line."
  [{:keys [pieces sp space-before?] :as _item}]
  (->> (for [{:keys [font pt] :as piece} pieces
             cp                          (seq (.codePoints ^String (:text piece)))
             :let [text (String. (Character/toChars (int cp)))]]
         (merge (select-keys piece [:font :pt :color :href])
                {:text text
                 :ww   (font/text-width font pt text)}))
       (map-indexed (fn [i p]
                      {:space-before? (and space-before? (zero? i))
                       :sp            sp
                       :pieces        [p]
                       :ww            (:ww p)}))))

(defn split-word-into-chars
  "The `split-fn` for [[pack-units->lines]]: break a too-wide word into per-codepoint pieces, leaving ruby groups
  and single-codepoint words atomic."
  [item]
  (if (or (:ruby? item)
          (<= (item-codepoint-count item) 1))
    [item]
    (split-into-chars item)))

(defn- pack-units->lines
  "Greedily pack pre-measured `units` into lines no wider than `max-w`. This is the shared word-wrap algorithm behind
  [[words->lines]], through which all text (Markdown cards, plain titles, headings, parameters) is wrapped.

  Each unit is a map carrying `:ww` (its drawn width), `:sp` (the width of one leading space), and `:space-before?`
  (whether the source had whitespace before it). A unit may instead be a `{:break? true}` marker, which forces a line
  break. A unit that alone exceeds `max-w` is broken via `split-fn` (a unit -> a seq of narrower pre-measured units;
  it returns the unit unchanged when it can't be split further, e.g. a single glyph).

  Returns a seq of lines, where each line is a seq of the same opaque input units, with each unit's `:space-before?`
  updated to whether *this line* draws a space before it. It's always false at the start of a line, so callers don't
  have to special-case the first unit.

  Note that while this resembles the shape that [[segment]] is for, there are two problems. First, [[segment]] is
  about grouping an input stream into *runs* with some property (e.g. text style) all the same; this function is
  about greedy bin-packing. Critically, atoms in this function are not *quite* indivisible! A single atom that is too
  big for a line by itself must be *divided* by [[split-word-into-chars]] to force a line break. There's no way to
  include that in the policy for [[segment]] without making it so intricate as to remove its value. An alternative
  HOF or transducer for bin-packing could be written, but this would be the only caller."
  [units max-w split-fn]
  (loop [[{:keys [break? sp space-before? ww] :as u} :as units] units
         line                                                   []
         line-w                                                 0.0
         lines                                                  (transient [])]
    (b/cond
      (empty? units)  (cond-> lines
                        (seq line) (conj! line)
                        :always    persistent!)

      ;; a hard break flushes the current line (which may be empty -> a blank line)
      break?          (recur (rest units) [] 0.0 (conj! lines line))

      :let [add-space? (and (seq line) space-before?)
            advance    (+ ww (if add-space? sp 0.0))
            ;; a unit alone on its line and wider than the whole line is a split candidate
            parts      (when (and (empty? line)
                                  (> ww max-w))
                         (split-fn u))]

      ;; the candidate actually split into more than one piece: retry with those in front
      (next parts)                       (recur (concat parts (rest units))
                                                line line-w lines)

      ;; the line is nonempty and the next unit won't fit: break here and retry the unit
      (and (seq line)
           (> (+ line-w advance) max-w)) (recur units [] 0.0 (conj! lines line))

      :else                              (recur (rest units)
                                                (conj line (assoc u :space-before? (boolean add-space?)))
                                                (+ line-w advance)
                                                lines))))

(defn- run-font [{:keys [bold? italic? code?]}]
  (font/face (cond
               code?               :mono
               (and bold? italic?) :bold-italic
               bold?               :bold
               italic?             :italic
               :else               :regular)))

(defn heading-pt
  "Font size for a Markdown heading of the given `level` (1 = `#`, 2 = `##`, ...)."
  [level]
  (case (long level)
    1 15.0
    2 13.5
    3 12.0
    11.5))

;; All text -- Markdown cards and plain titles/headings alike -- funnels through `runs->words` ->
;; `->measured-item` -> `pack-units->lines` -> `draw-item-lines!`. Plain text (see `draw-text-block!`)
;; is just the degenerate case of a single styled run.
(defn runs->words
  "Turn a run stream (style + text chunks, possibly spanning whole paragraphs) into a flat vector of
  word tokens that can't break across a line: a multi-piece word `{:space-before? _ :pieces
  [{:style _ :text _}…]}`, a `{:ruby? …}` furigana group, or a `{:break? true}` hard break.

  One composed transducer over all runs at once: flatten to a codepoint/atomic stream
  ([[run->items]]), drop whitespace + stamp `:space-before?` ([[mark-space-before]]), then greedily
  group into words ([[segment]] + [[collect-word]]). Because words split on *whitespace* rather than
  run boundaries, a word naturally spans runs (so `\"**bo**ld\"` is one indivisible word with two
  styled pieces), which also makes inter-run spacing and CJK kinsoku fall out with no bookkeeping."
  [runs]
  (into [] (comp (mapcat run->items)
                 (mark-space-before false)
                 (segment collect-word close-word))
        runs))

(defn- run-color [style]
  (or (:color style)                     ; an explicit colour overrides (e.g. gray parameter values)
      (cond (:link? style) common/link-color
            (:code? style) common/code-color
            :else          Color/BLACK)))

(defmulti ->measured-item
  "Turn one Markdown word token into a drawable, pre-measured item (resolving its font and colour),
  ready for [[pack-units->lines]]. A furigana group becomes an atomic item whose width is the wider
  of its base and reading; a `{:break? true}` marker passes through unchanged. `:space-before?` is
  left as the source-level flag here -- `pack-units->lines` finalises it per line."
  {:arglists '([word-token base-pt heading?])}
  (fn [w _base-pt _heading?]
    (cond
      (:break? w) :break
      (:ruby?  w) :ruby
      :else       :default)))

(defmethod ->measured-item :break [w _base-pt _heading?]
  w)

(defmethod ->measured-item :ruby [{:keys [base reading style] :as w} base-pt heading?]
  ;; furigana group: base text with a smaller reading centered above; the item is atomic
  ;; (the reading must never wrap away from its base), and as wide as the wider of the two.
  (let [font    (run-font (cond-> style heading? (assoc :bold? true)))
        ruby-pt (* base-pt common/ruby-scale)
        bw      (font/text-width font base-pt base)
        rw      (font/text-width font ruby-pt reading)]
    (merge (select-keys w [:base :reading :space-before?])
           {:ruby?      true
            :font       font
            :pt         base-pt
            :ruby-pt    ruby-pt
            :base-ww    bw
            :reading-ww rw
            :color      (run-color style)
            :href       (:href style)
            :ww         (max bw rw)
            :sp         (font/text-width font base-pt " ")})))

(defmethod ->measured-item :default [{:keys [pieces space-before?]} base-pt heading?]
  ;; a word is a sequence of same-style pieces; each piece resolves its own font/colour and the word's
  ;; width is their sum. The line packer treats the word atomically; the draw path lays the pieces out
  ;; contiguously (no inter-piece space).
  (let [measured (mapv (fn [{:keys [style text]}]
                         (let [font (run-font (cond-> style heading? (assoc :bold? true)))]
                           {:font font :pt base-pt :color (run-color style) :href (:href style)
                            :text text :ww (font/text-width font base-pt text)}))
                       pieces)]
    {:space-before? space-before?
     :pieces        measured
     :ww            (transduce (map :ww) + 0.0 measured)
     ;; one leading space, drawn in the first piece's font when this word follows another on a line
     :sp            (let [{:keys [font]} (first measured)] (font/text-width font base-pt " "))}))

(defn words->lines
  "Greedily wrap `words` to `max-w`, resolving each word's font/colour. Returns a vector of lines,
  each a vector of drawable items `{:pieces :ww :sp :space-before? ...}` (or atomic ruby/break items)."
  [words base-pt heading? max-w]
  (pack-units->lines (map #(->measured-item % base-pt heading?) words) max-w split-word-into-chars))

(defn line-extra
  "Extra vertical space a line needs above its base text -- the furigana band, if it has any ruby."
  [line base-pt]
  (if (some :ruby? line) (* base-pt common/ruby-scale 1.2) 0.0))

(defn lines-height
  "Total vertical points a sequence of wrapped item-lines consumes at `base-pt`, including any
  furigana bands (see [[line-extra]])."
  [lines base-pt]
  (let [lh (* base-pt common/line-height-factor)]
    (reduce (fn [acc line] (+ acc lh (line-extra line base-pt))) 0.0 lines)))

(defmulti ^:private block-height
  "Vertical points a block consumes when laid out at `scale` (mirrors `draw-block!`)."
  {:arglists '([block cell-w scale])}
  (fn [block _cell-w _scale]
    (:kind block)))

(defmethod block-height :hr [_block _cell-w scale]
  (* scale 10.0))

(defmethod block-height :image [_block _cell-w _scale]
  ;; Images don't participate in the font fit-scale: shrinking the text wouldn't shrink an image,
  ;; so an image must never force the surrounding text smaller. They contribute no height here and
  ;; are instead scaled (aspect-preserved) to fit whatever space is left after the text -- see
  ;; `draw-image-block!`.
  0.0)

(defmethod block-height :code-block [{:keys [text]} _cell-w scale]
  (-> (str text)
      str/split-lines
      count
      (* 9.0 scale common/line-height-factor)
      (+ 2.0)))

(defmethod block-height :default
  [{:keys [indent kind level marker runs]} cell-w scale]
  (let [heading?  (= :heading kind)
        base-pt   (* (if heading?
                       (heading-pt level)
                       common/text-card-pt)
                     scale)
        marker-w  (if marker
                    (font/text-width (font/face :regular) base-pt marker)
                    0.0)
        content-w (- cell-w
                     (* 14.0 (long (or indent 0)))
                     marker-w)]
    (-> (runs->words runs)
        (words->lines base-pt heading? content-w)
        (lines-height base-pt))))

(defn- markdown-total-height [blocks cell-w scale]
  (transduce (map #(+ (block-height % cell-w scale) (* 4.0 scale)))
             + 0.0
             blocks))

(defn fit-scale
  "Largest font scale (<= 1.0, down to a readability floor) at which the markdown fits `cell-h`.
  Shrinks the text only when the content would otherwise overflow (and clip) the cell."
  [blocks cell-w cell-h]
  (or (first (filter #(<= (markdown-total-height blocks cell-w %)
                          cell-h)
                     (range 1.0 0.44 -0.05)))
      0.45))

(defn item-text
  "The full text of a measured item -- its `:text`, a ruby item's `:base`, or a multi-piece word's
  concatenated piece text. Used for RTL detection and bidi reordering."
  [{:keys [base text pieces] :as _item}]
  (cond
    text   (str text)
    base   (str base)
    pieces (transduce (map :text) str pieces)   ; a multi-piece word's full text
    :else  ""))

(defn- any-rtl? [items]
  (boolean (some #(font/contains-rtl? (item-text %))
                 items)))

(defn reorder-bidi-items
  "Reorder a wrapped markdown line's word items from logical to visual order, so a right-to-left paragraph reads
  right-to-left at the word level. Each item's own glyphs are shaped/reversed separately by `draw-line!`
  (via `font/visual-order`); this handles the *order of the words*.

  We resolve bidi levels with ICU over the line's logical text (one representative offset per item), apply rule L2
  via `Bidi/reorderVisual`, then recompute each item's `:space-before?` for its new neighbour so inter-word spacing
  follows the visual order. Lines with no RTL text (the common case) are returned untouched."
  [items]
  (if (or (empty? items)
          (not (any-rtl? items)))
    items
    (let [sb     (StringBuilder.)
          starts (mapv (fn [it]
                         (when (and (:space-before? it)
                                    (pos? (.length sb)))
                           (.append sb \space))
                         (let [start (.length sb)]
                           (.append sb (item-text it))
                           start))
                       items)
          bidi   (Bidi. (.toString sb) (int Bidi/LEVEL_DEFAULT_LTR))
          levels (byte-array (map (fn [start] (.getLevelAt bidi (int start)))
                                  starts))
          order  (Bidi/reorderVisual levels)]
      (into [] (map-indexed
                (fn [vp lp]
                  ;; visually adjacent items are logically adjacent; the gap between two words is
                  ;; recorded on the one with the higher logical index, so reuse that flag.
                  (let [sep? (and (pos? vp)
                                  (->> (max (aget order (dec vp))
                                            (int lp))
                                       (nth items)
                                       :space-before?
                                       boolean))]
                    (assoc (nth items lp) :space-before? sep?)))
                order)))))

(defn md-line-width
  "Drawn width of a (reordered) markdown line: each item's advance plus the space before it."
  ^double [items]
  (transduce (map (fn ^double [{:keys [sp space-before? ww]}]
                    (double (+ ww (if space-before? sp 0.0)))))
             + 0.0 items))

(def face-id->style
  "Inverse of [[run-font]]: the run style that selects each face. Lets plain text drawn with an explicit face be
  expressed as a single styled run and fed through the shared item pipeline."
  {:regular     {}
   :bold        {:bold? true}
   :italic      {:italic? true}
   :bold-italic {:bold? true, :italic? true}
   :mono        {:code? true}})

(defn text-block-height
  "Vertical points a wrapped text block would consume (without drawing), bounded by `max-h`.

  Uses the same single-styled-run item pipeline as [[draw-text-block!]]."
  [face font-pt max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [lh    (* font-pt common/line-height-factor)
          runs  [(merge {:text (str text)}
                        (get face-id->style (:id face)))]
          lines (words->lines (runs->words runs) font-pt false max-w)
          fit   (-> (/ max-h lh) double Math/floor long (max 0))]
      (min (lines-height lines font-pt)
           (* fit lh)))))

;; --------------------------------------------------------------------------------------------
;; Parameters. The dashboard's active filter values are shown once at the very top, as a two-column
;; (name | value) table (like the email filter bar). A card's *inline* parameters render on the card
;; itself, flowing inline as `Name: value`. Both reuse the common text layout/draw pipeline; the only
;; bespoke piece is sizing the table's name column (see [[min-column-width]]).
;; --------------------------------------------------------------------------------------------

(defn min-column-width
  "The narrowest width (<= `max-w`) at which `units` still pack into the *fewest* lines they would take at `max-w`.

  This is the *bottleneck* variant of word-wrap: given that at least N lines are required, minimise the max width
  for that fixed line count. We solve it by binary search using the greedy [[pack-units->lines]] as a monotonic
  feasibility oracle. (Monotonic because a wider column never needs more lines.)

  The search bottoms out at the widest single unit (= word).

  Inexpensive -- a handful of greedy line wrap calls, with each unit's measurements cached (see [[font/*em-width*]])."
  [units max-w split-fn]
  (if (empty? units)
    0.0
    (let [lines-at (fn [w] (count (pack-units->lines units w split-fn)))
          target   (lines-at max-w)
          lo0      (transduce (map :ww) max 0.0 units)]
      (loop [lo lo0
             hi (double max-w)]
        (if (< (- hi lo) 0.5)
          hi
          (let [mid (/ (+ lo hi) 2.0)]
            (if (<= (lines-at mid) target)
              (recur lo mid)
              (recur mid hi))))))))

(ns metabase.channel.render.pdf.markdown
  "Markdown parser (powered by Flexmark) producing a stream of styled runs of text, suitable for the PDF rendering
  engine to consume."
  (:require
   [clojure.string :as str]
   [metabase.util.http :as u.http])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading Image IndentedCodeBlock Link MailLink OrderedList
                             Paragraph SoftLineBreak StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.ext.autolink AutolinkExtension)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Node)
   (com.vladsch.flexmark.util.data MutableDataSet)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream)
   (javax.imageio ImageIO ImageReader)
   (org.apache.pdfbox.pdmodel PDDocument)
   (org.apache.pdfbox.pdmodel.graphics.image LosslessFactory)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; Markdown image fetching. Markdown text cards can reference remote images, which means fetching
;; user-provided URLs server-side -- the classic SSRF risk. The SSRF-hardened fetch itself lives in
;; [[metabase.util.http/fetch-bytes]]; here we only add the image-specific decoding: restrict to
;; raster content-types and reject over-large images (decompression-bomb guard) before decoding.
;; Any failure returns nil and the caller renders a Markdown link instead.
;; --------------------------------------------------------------------------------------------
(def ^:private image-max-megapixels 24)
(def ^:private allowed-image-content-types #{"image/png" "image/jpeg" "image/gif"})

(defn- decode-image
  "Decode `bytes` into a `PDImageXObject` embedded in `doc`, rejecting images over the megapixel cap
  (decompression-bomb guard) by reading dimensions before the full decode. Returns nil on failure."
  [^PDDocument doc ^bytes bytes]
  (try
    (with-open [iis (ImageIO/createImageInputStream (ByteArrayInputStream. bytes))]
      (let [readers (ImageIO/getImageReaders iis)]
        (when (.hasNext readers)
          (let [^ImageReader rdr (.next readers)]
            (try
              (.setInput rdr iis)
              (let [w (.getWidth rdr 0), h (.getHeight rdr 0)]
                (when (and (pos? w) (pos? h)
                           (<= (* (long w) (long h)) (* image-max-megapixels 1000000)))
                  (let [^BufferedImage bi (.read rdr 0)]
                    (LosslessFactory/createFromImage doc bi))))
              (finally (.dispose rdr)))))))
    (catch Throwable _ nil)))

(defn fetch-image!
  "SSRF-safely fetch + decode a remote image URL into a `PDImageXObject`, or nil if anything fails."
  [^PDDocument doc url]
  (when-let [bytes (:bytes (u.http/fetch-bytes url {:allowed-content-types allowed-image-content-types}))]
    (decode-image doc bytes)))

;; --------------------------------------------------------------------------------------------
;; Markdown -> styled runs (text cards). We parse with flexmark (the same library the email
;; pipeline uses) but walk the AST ourselves, emitting block + inline-run structure that maps to
;; PDFBox fonts/colors -- since PDFBox has no HTML engine, the email's HTML output is no use here.
;; --------------------------------------------------------------------------------------------

(def ^:private md-parser
  (delay (-> (MutableDataSet.)
             (.set Parser/EXTENSIONS [(AutolinkExtension/create)])
             (Parser/builder)
             (.build))))

(defn- node-children [^Node node]
  ;; getChildren returns an Iterable, which `seq` supports out of the box.
  (seq (.getChildren node)))

(defn- md-unescape
  "Resolve CommonMark backslash escapes (`\\,` -> `,`) the way flexmark's HtmlRenderer does -- `.getChars` on a Text
  node returns the raw source, escapes included. Parameter substitution escapes interpolated values, so e.g. a
  multi-value filter arrives as `A\\, B\\, and C`."
  [s]
  (str/replace (str s) #"\\(\p{Punct})" "$1"))

(declare ^:private inline-runs)

(defn- parse-ruby
  "Split plain text into runs, turning `{base|reading}` furigana shorthand into ruby runs
  (`{:ruby? true :base … :reading …}`) and leaving the rest as ordinary text runs."
  [text style href]
  (let [s (str text)
        m (re-matcher #"\{([^{}|]+)\|([^{}|]+)\}" s)]
    (loop [last 0
           out  []]
      (if (.find m)
        (recur (.end m)
               (cond-> out
                 (< last (.start m)) (conj (assoc style :text (subs s last (.start m)) :href href))
                 true                (conj (assoc style :ruby? true :base (.group m 1)
                                                  :reading (.group m 2) :href href))))
        (cond-> out
          (< last (count s)) (conj (assoc style :text (subs s last) :href href)))))))

(defn- inline-node->runs
  "Convert a single inline node into styled runs. Images nested in inline content degrade to their alt text; top-level
  paragraph images are pulled out as `:image` blocks (see `paragraph->blocks`)."
  [^Node c style href]
  (condp instance? c
    Text           (-> (.getChars c) md-unescape (parse-ruby style href))
    StrongEmphasis (inline-runs c (assoc style :bold?   true) href)
    Emphasis       (inline-runs c (assoc style :italic? true) href)
    Link           (inline-runs c style                       (str (.getUrl ^Link c)))
    Code           [(assoc style
                           :code? true
                           :text  (str (.getText ^Code c))
                           :href  href)]
    AutoLink       (let [u (str (.getText ^AutoLink c))]
                     [(assoc style :text u :href u)])
    MailLink       (let [u (str (.getText ^MailLink c))]
                     [(assoc style :text u :href (str "mailto:" u))])
    Image          (let [alt (str (.getText ^Image c))]
                     [(assoc style
                             :text (if (str/blank? alt) "[image]" alt)
                             :href (str (.getUrl ^Image c)))])
    SoftLineBreak  [{:text " " :space? true}]
    HardLineBreak  [{:break? true}]
    (if (.getFirstChild c)
      (inline-runs c style href)
      (-> (.getChars c) md-unescape (parse-ruby style href)))))

(defn- inline-runs
  "Flatten a block node's inline children into styled runs: each is `{:text :bold? :italic? :code? :href}`, plus
  `{:break? true}` for a hard line break."
  ([^Node node] (inline-runs node {} nil))
  ([^Node node style href]
   (into [] (mapcat #(inline-node->runs % style href))
         (node-children node))))

;; FIXME: There are so many `loop`s in all this code. Either we should suck it up and use mapcat and flatten and other
;; Clojure niceties without worrying about performance, *or* these should be written as reducibles that stream their
;; results into a sink, rather than all this conditional `conj` onto `out` etc.
(defn- paragraph->blocks
  "A paragraph normally becomes one `:paragraph` block, but top-level images are pulled out as standalone `:image`
  blocks, interleaved with the surrounding text."
  [^Node node]
  (loop [children (node-children node)
         runs     []
         out      []]
    (if (empty? children)
      (cond-> out (seq runs) (conj {:kind :paragraph :runs runs}))
      (let [^Node c (first children)]
        (if (instance? Image c)
          (recur (rest children) []
                 (cond-> out
                   (seq runs) (conj {:kind :paragraph :runs runs})
                   true       (conj {:kind :image
                                     :src  (str (.getUrl ^Image c))
                                     :alt  (str (.getText ^Image c))})))
          (recur (rest children) (into runs (inline-node->runs c {} nil)) out))))))

(declare ^:private block->blocks)

;; FIXME: Use this for a few of the other "first one only" things like this. There's at least two others IIRC.
(defn- on-first
  "Returns a stateful transducer that applies `(f x)` only to the first element in the sequence. Passes through all
  subsequent elements unchanged."
  [f]
  (fn [xf]
    (let [seen? (volatile! false)]
      (fn
        ([] (xf))
        ([res] (xf res))
        ([res x]
         (xf res (if @seen?
                   x
                   (do (vreset! seen? true)
                       (f x)))))))))

(defn- list->blocks [^Node list-node depth ordered?]
  (into [] (comp (map-indexed
                  (fn [idx ^Node item]
                    (into [] (comp (mapcat #(block->blocks % (inc depth)))
                                   (on-first #(cond-> %
                                                (= :paragraph (:kind %)) (assoc :kind   :list-item
                                                                                :indent depth
                                                                                :marker (if ordered?
                                                                                          (str (inc idx) ". ")
                                                                                          "- ")))))
                          (node-children item))))
                 cat)
        (node-children list-node)))

(defn- block->blocks
  "Convert a flexmark block node into a flat vector of layout blocks `{:kind :runs ...}`."
  [^Node node depth]
  (condp instance? node
    Heading           [{:kind :heading :level (.getLevel ^Heading node) :runs (inline-runs node)}]
    Paragraph         (paragraph->blocks node)
    BulletList        (list->blocks node depth false)
    OrderedList       (list->blocks node depth true)
    FencedCodeBlock   [{:kind :code-block :text (str (.getContentChars ^FencedCodeBlock node))}]
    IndentedCodeBlock [{:kind :code-block :text (str (.getContentChars ^IndentedCodeBlock node))}]
    BlockQuote        (into [] (comp (mapcat #(block->blocks % depth))
                                     (map #(update % :indent (fnil inc 0))))
                            (node-children node))
    ThematicBreak     [{:kind :hr}]
    (if (.getFirstChild node)
      (into [] (mapcat #(block->blocks % depth))
            (node-children node))
      [])))

(defn parse-markdown-blocks
  "Parses a string of Markdown syntax into a stream of blocks containing `:runs` of text."
  [text]
  (->> (.parse ^Parser @md-parser (str text))
       node-children
       (into [] (mapcat #(block->blocks % 0)))))

;; FIXME: Big picture, all the Markdown code is repeatedly pouring nested stuff into a top-level, flattened list.
;; It seems like it would be much more efficient, and probably easier to read too, if the whole thing were written
;; as a reducible pipeline, streaming the results into a final sink.

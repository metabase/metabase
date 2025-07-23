(ns metabase.util.markdown.question-link
  "Flexmark extension for parsing {{card:<id>}} links into CardLink AST nodes."
  (:import [com.vladsch.flexmark.html.renderer NodeRenderer NodeRendererContext NodeRendererFactory NodeRenderingHandler]
           [com.vladsch.flexmark.parser Parser InlineParser InlineParserExtension InlineParserExtensionFactory LightInlineParser]
           [com.vladsch.flexmark.util.ast DelimitedNode]
           [com.vladsch.flexmark.util.ast Node]
           [com.vladsch.flexmark.util.misc Extension]
           [com.vladsch.flexmark.util.sequence BasedSequence]
           [java.util Collections]
           [java.util.regex Pattern]))

(set! *warn-on-reflection* true)
;;; CardLink AST Node

(defn make-card-link-node []
  (proxy [Node DelimitedNode] []
    ;; DelimitedNode methods
    (getOpeningMarker [] (BasedSequence/NULL))
    (setOpeningMarker [opening-marker] nil)
    (getClosingMarker [] (BasedSequence/NULL))
    (setClosingMarker [closing-marker] nil)

    ;; Node methods
    (getSegments []
      (let [segments (proxy-super getSegments)]
        segments))

    ;; Custom methods for our use
    (getCardId []
      (when-let [text (.getChars this)]
        (let [matcher (re-matcher #"\{\{card:(\d+)\}\}" (str text))]
          (when (.find matcher)
            (.group matcher 1)))))))

;;; Inline Parser

(def card-link-pattern
  (Pattern/compile "\\{\\{card:(\\d+)\\}\\}"))

(defn parse-card-link [^InlineParser parser ^BasedSequence input]
  (let [matcher (.matcher card-link-pattern input)
        index (.getIndex parser)]
    (when (and (.find matcher index)
               (= (.start matcher) index))
      (let [start-index (.start matcher)
            end-index (.end matcher)
            card-link (make-card-link-node)]
        ;; Set the node's text range
        (.setChars card-link (.subSequence input start-index end-index))
        ;; Return true to indicate we consumed the input
        (.flushPending parser)
        (.appendNode (.getBlock parser) card-link)
        (.setIndex parser end-index)
        true))))

(defn make-inline-parser-extension ^InlineParserExtension []
  (reify InlineParserExtension
    (finalizeDocument [_this parser]
      ;; No finalization needed
      )
    (finalizeBlock [_this parser]
      ;; No block finalization needed
      )
    (parse [_this parser]
      (let [input (.getInput parser)
            current-char (.charAt input (.getIndex parser))]
        (when (= current-char \{)
          (parse-card-link parser input))))))

(defn make-inline-parser-factory []
  (reify InlineParserExtensionFactory
    (getCharacters [_this]
      (Collections/singleton \{))
    (^InlineParserExtension apply [_this ^LightInlineParser _context]
      (make-inline-parser-extension))))

;;; Extension

(defn make-card-link-extension []
  (reify Parser$ParserExtension
    (extend [_this parser-builder]
      (.customInlineParserExtensionFactory parser-builder
                                           (make-inline-parser-factory)))))

;;; Public API

(defn create
  "Create a new question-link extension instance."
  []
  (make-card-link-extension))

(defn with-question-links
  "Add question-link support to a Flexmark options builder."
  [options]
  (.extensions options [(create)])
  options)

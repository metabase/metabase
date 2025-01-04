(ns metabase.cmd.endpoint-dox.markdown.generate
  "Code for generating Markdown (specifically for API documentation) from a Hiccup-style tree.

  This code prints stuff so you can use [[with-out-str]] and build the string quickly and efficiently with a
  StringBuilder rather than doing crazy amounts of string manipulation... in most cases the code is simpler this way
  as well.")

(defmulti print-markdown
  "Print a Markdown node to [[*out*]]."
  {:arglists '([x])}
  (fn [x]
    (if (and
         (sequential? x)
         (keyword? (first x)))
      (first x)
      (type x))))

(defmethod print-markdown nil [_] nil)

(defmethod print-markdown Object [s]
  (print (str s)))

(defn- print-with-seperator [separator [item & more :as items]]
  (if (nil? item)
    (when (seq more)
      (recur separator more))
    (do
      (print-markdown item)
      (when (seq more)
        (print separator)
        (recur separator more)))))

;;; default behavior for a sequence: join args with two newlines.
(defmethod print-markdown clojure.lang.Sequential
  [coll]
  (print-with-seperator "\n\n" coll))

;;; join args with a single space.
(defmethod print-markdown :spaces
  [[_span & args]]
  (print-with-seperator " " args))

;;; join args with a single newline.
(defmethod print-markdown :single-newlines
  [[_newlines & args]]
  (print-with-seperator "\n" args))

(defn- print-header [hashes args]
  (print-markdown (list* :spaces hashes args)))

(defmethod print-markdown :h1 [[_h & args]] (print-header "#" args))
(defmethod print-markdown :h2 [[_h & args]] (print-header "##" args))
(defmethod print-markdown :h3 [[_h & args]] (print-header "###" args))
(defmethod print-markdown :h4 [[_h & args]] (print-header "####" args))
(defmethod print-markdown :h5 [[_h & args]] (print-header "#####" args))
(defmethod print-markdown :h6 [[_h & args]] (print-header "######" args))

(defmethod print-markdown :link
  [[_link text link]]
  (print "[")
  (print-markdown text)
  (print "](")
  (print link)
  (print ")"))

(defmethod print-markdown :code
  [[_code & args]]
  (print "`")
  (print-markdown (cons :spaces args))
  (print "`"))

(defmethod print-markdown :bullet-point
  [[_bullet & args]]
  ;; TODO -- this should increase indentation by one level, we don't really need anything that fancy yet but in the
  ;; future we might want to add it.
  (print "- ")
  (print-markdown args))

(defmethod print-markdown :frontmatter
  [[_frontmatter & maps]]
  (println "---")
  (doseq [[k v] (reduce merge {} maps)]
    (print (name k))
    (print ": ")
    (print-markdown v)
    (println))
  (print "---"))

(defmethod print-markdown :include-file
  [[_include-file & files]]
  (doseq [file files]
    (print (slurp file))))

(defmethod print-markdown :b
  [[_b & args]]
  (print "**")
  (print-markdown (cons :spaces args))
  (print "**"))

(defmethod print-markdown :i
  [[_b & args]]
  (print "*")
  (print-markdown (cons :spaces args))
  (print "*"))

(defmethod print-markdown :table
  [[_table header & rows]]
  (letfn [(print-row [items]
            (print "| ")
            (print-with-seperator " | " items)
            (println " |"))]
    (print-row header)
    (print-row (repeat (count header) "-----"))
    (doseq [row rows]
      (print-row row))))

(defn ->markdown
  "Generate a Markdown string from a Hiccup-style tree."
  [s]
  (with-out-str
    (print-markdown s)
    (flush)))

;;;;
;;;; Example usages
;;;;

(comment
  (print-markdown [:table
                   [[:b "Key"] [:b "Schema"]]
                   [[:code "id"] "value must be an integer greater than zero."]]))

;;; PLEASE DON'T ADD ANY MORE CODE AFTER THE EXAMPLE USAGES ABOVE, GO ADD IT SOMEWHERE ELSE.

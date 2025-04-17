((nil
  ;; always use spaces for tabs
  (indent-tabs-mode . nil)
  ;; add final newline on save
  (require-final-newline . t)
  ;; prefer keeping source width about ~118, GitHub seems to cut off stuff at either 119 or 120 and it's nicer
  ;; to look at code in GH when you don't have to scroll back and forth
  (fill-column . 118)
  (whitespace-line-column . 118)
  ;; tell find-things-fast to always use this directory as project root regardless of presence of other
  ;; deps.edn files
  (ftf-project-finders . (ftf-get-top-git-dir)))

 (js2-mode
  ;; these settings will let flycheck do everything through eslint,
  (js2-mode-show-parse-errors . nil)
  ;; because js2-mode can't handle flowtype
  (js2-mode-show-strict-warnings . nil))

 (clojure-mode
  ;; Specify which arg is the docstring for certain macros
  ;; (Add more as needed)
  (eval . (put 'define-premium-feature             'clojure-doc-string-elt 2))
  (eval . (put 'api.macros/defendpoint             'clojure-doc-string-elt 3))
  (eval . (put 'defsetting                         'clojure-doc-string-elt 2))
  (eval . (put 'setting/defsetting                 'clojure-doc-string-elt 2))
  (eval . (put 's/defn                             'clojure-doc-string-elt 2))
  (eval . (put 'p.types/defprotocol+               'clojure-doc-string-elt 2))
  (eval . (put 'methodical/defmethod               'clojure-doc-string-elt 3))
  (eval . (put 'methodical/defmulti                'clojure-doc-string-elt 2))
  (eval . (put 'mi/define-simple-hydration-method  'clojure-doc-string-elt 3))
  (eval . (put 'mi/define-batched-hydration-method 'clojure-doc-string-elt 3))
  (eval . (put 'mr/def                             'clojure-doc-string-elt 2))
  (eval . (put 'mu/defn                            'clojure-doc-string-elt 2))
  ;; Define custom indentation for functions inside metabase.
  ;; This list isn't complete; add more forms as we come across them.
  ;;
  ;; `put-clojure-indent' is a safe-local-eval-function, so use a bunch of calls to that
  ;; instead of one call to `define-clojure-indent'
  (eval . (put-clojure-indent 'api/let-404                     1))
  (eval . (put-clojure-indent 'c/step                          1))
  (eval . (put-clojure-indent 'impl/test-migrations            2))
  (eval . (put-clojure-indent 'let-404                         0))
  (eval . (put-clojure-indent 'lib.schema.match/match          '(:defn)))
  (eval . (put-clojure-indent 'lib.schema.match/match-one      '(:defn)))
  (eval . (put-clojure-indent 'lib.schema.match/replace        '(:defn)))
  (eval . (put-clojure-indent 'lib.schema.match/replace-in     '(:defn)))
  (eval . (put-clojure-indent 'lib.util.match/replace          '(:defn)))
  (eval . (put-clojure-indent 'macros/case                     0))
  (eval . (put-clojure-indent 'match                           1))
  (eval . (put-clojure-indent 'mt/dataset                      1))
  (eval . (put-clojure-indent 'mt/format-rows-by               '(:form)))
  (eval . (put-clojure-indent 'mt/query                        1))
  (eval . (put-clojure-indent 'mt/test-driver                  1))
  (eval . (put-clojure-indent 'mt/test-drivers                 1))
  (eval . (put-clojure-indent 'mt/with-anaphora                1))
  (eval . (put-clojure-indent 'prop/for-all                    1))
  (eval . (put-clojure-indent 'qp.streaming/streaming-response 1))
  (eval . (put-clojure-indent 'tc/quick-check                  1))
  (eval . (put-clojure-indent 'u/profile                       1))
  (eval . (put-clojure-indent 'u/prog1                         1))
  (eval . (put-clojure-indent 'u/select-keys-when              '(:form)))
  (eval . (put-clojure-indent 'with-meta                       '(:form)))
  ;; these ones have to be done with `define-clojure-indent' for now because of upstream bug
  ;; https://github.com/clojure-emacs/clojure-mode/issues/600 once that's resolved we should use `put-clojure-indent'
  ;; instead. Please don't add new entries unless they don't work with `put-clojure-indent'
  (eval . (define-clojure-indent
           (l/matcha                  '(1 (:defn)))
           (l/matche                  '(1 (:defn)))
           (p.types/def-abstract-type '(1 (:defn)))
           (p.types/defprotocol+      '(1 (:defn)))
           (p.types/defrecord+        '(2 nil nil (:defn)))
           (p.types/deftype+          '(2 nil nil (:defn)))
           (p/def-map-type            '(2 nil nil (:defn)))
           (p/defprotocol+            '(1 (:defn)))
           (p/defrecord+              '(2 nil nil (:defn)))
           (p/deftype+                '(2 nil nil (:defn)))
           (tools.macro/macrolet      '(1 ((:defn)) :form))))
  (cider-clojure-cli-aliases . "dev:drivers:drivers-dev:ee:ee-dev:user")
  (clojure-indent-style . always-align)
  (cljr-favor-prefix-notation . nil)
  (cljr-insert-newline-after-require . t)
  (cljr-print-right-margin . 118)
  (clojure-docstring-fill-column . 118)
  (cider-preferred-build-tool . clojure-cli)
  (cider-default-cljs-repl . shadow-select)
  (cider-shadow-default-options . "app"))

 ("bin"
  (clojure-mode
   (cider-clojure-cli-aliases . "dev:drivers:build:build-dev"))))

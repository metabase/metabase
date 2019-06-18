((nil . ((indent-tabs-mode . nil)       ; always use spaces for tabs
         (require-final-newline . t)))  ; add final newline on save
 (clojure-mode . (;; if you're using clj-refactor (highly recommended!), prefer prefix notation when cleaning the ns form
                  (cljr-favor-prefix-notation . t)
                  ;; prefer keeping source width about ~118, GitHub seems to cut off stuff at either 119 or 120 and
                  ;; it's nicer to look at code in GH when you don't have to scroll back and forth
                  (fill-column . 118)
                  (clojure-docstring-fill-column . 118))))

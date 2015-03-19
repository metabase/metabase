((clojure-mode . ((eval . (progn
                            ;; Define custom indentation for functions inside metabase.
                            ;; This list isn't complete; add more forms as we come across them.
                            (define-clojure-indent
                              (api-let 2)
                              (auto-parse 1)
                              (catch-api-exceptions 0)
                              (check 1)
                              (context 2)
                              (expect 1)
                              (expect-eval-actual-first 1)
                              (expect-let 1)
                              (ins 1)
                              (let-400 1)
                              (let-404 1)
                              (let-500 1)
                              (match 1)
                              (match-$ 1)
                              (macrolet 1)
                              (org-perms-case 1)
                              (upd 2)
                              (with-credentials 1)))))))

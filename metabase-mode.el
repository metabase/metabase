;; metabase-mode --- A minor mode for interacting with Metabase™ -*- lexical-binding: t; coding: utf-8; -*-

;;; Commentary:

;; TODO
;; *  make this a legitimate minor mode
;; *  warn if there's no NREPL connection
;; *  prompt and replace URL params like ":id"
;; *  prompt for user / support users besides :rasta
;; *  infer other GET params like org
;; *  display pop-up dox for params
;; *  Need to be more sophisticated about the routes that get returned from Clojure.
;;    (GET /meta/table/:id/autocomplete/suggestions is a bit off !)
;; *  Support POST params
;; *  DB Interaction mode would be nice

;;; Code:

(require 'cider)
(require 'cider-repl)
(require 'helm)

(defvar metabase-mode--api-endpoints-list nil)
(defvar metabase-mode--api-method :get)

(defvar metabase-mode--api-endpoints-helm-source
  '((name . "Metabase API Endpoints")
    (candidates . (lambda ()
                    (metabase-mode--api-endpoints-of-method metabase-mode--api-method)))
    (action . (lambda (selected-endpoint)
                selected-endpoint))))

(defun metabase-mode--fetch-api-endpoints-list ()
  (nrepl-request:eval "(api-endpoints-list)"
                      (nrepl-make-response-handler (cider-current-repl-buffer)
                                                   (lambda (buffer value)
                                                     (setq metabase-mode--api-endpoints-list (read value)))
                                                   (lambda (buffer out))
                                                   (lambda (buffer err))
                                                   (lambda (buffer)))
                      "metabase.test.dev"))

(defun metabase-mode--api-endpoints-of-method (method)
  (cadr (assoc method metabase-mode--api-endpoints-list)))

(defun metabase-mode--api-prompt-for-method ()
  (let ((case-fold-search t)
        (choice (read-char-choice "[G]ET, [P]OST, P[U]T, [D]ELETE? " '(?G ?P ?U ?D ?g ?p ?u ?d))))
    (cond
     ((char-equal choice ?G) :get)
     ((char-equal choice ?P) :post)
     ((char-equal choice ?u) :put)
     ((char-equal choice ?d) :delete))))

(defun metabase-mode--api-prompt-for-endpoint ()
  (helm :sources metabase-mode--api-endpoints-helm-source))

(defun metabase-mode-api-call ()
  (interactive)
  (unless metabase-mode--api-endpoints-list
    (nrepl-request:eval "(require 'metabase.test.dev)"
                        (lambda (&rest _)
                          (metabase-mode--fetch-api-endpoints-list))))
  (let* ((method (metabase-mode--api-prompt-for-method))
         (_ (setq metabase-mode--api-method method))
         (endpoint (metabase-mode--api-prompt-for-endpoint))
         (api-call-form (concat "(make-api-call " (symbol-name method) " \"" endpoint "\")")))
    (when endpoint
      (nrepl-request:pprint-eval api-call-form
                                 (nrepl-make-response-handler (cider-current-repl-buffer)
                                                              (lambda (buffer value))
                                                              (lambda (buffer output)
                                                                (let ((output-buffer (get-buffer-create "*metabase-api-output*")))
                                                                  (with-current-buffer output-buffer
                                                                    (clojure-mode)
                                                                    (erase-buffer)
                                                                    (insert output)
                                                                    (goto-char (point-min))
                                                                    (display-buffer output-buffer))))
                                                              (lambda (buffer err))
                                                              (lambda (buffer)))
                                 "metabase.test.dev"
                                 nil
                                 120))))

(define-key cider-mode-map
  (kbd "C-c m a") #'metabase-mode-api-call)


(provide 'metabase-mode)
;; metabase-mode.el ends here

(ns metabuild-common.core
  (:require [metabuild-common
             [aws :as aws]
             [entrypoint :as entrypoint]
             [env :as build.env]
             [files :as files]
             [input :as input]
             [output :as output]
             [shell :as shell]
             [steps :as steps]]
            [potemkin :as p]))

;; since this file is used pretty much everywhere, this seemed like a good place to put this.
(set! *warn-on-reflection* true)

(comment aws/keep-me
         entrypoint/keep-me
         build.env/env
         files/keep-me
         input/keep-me
         output/keep-me
         shell/keep-me
         steps/keep-me)

(p/import-vars
 [aws
  create-cloudfront-invalidation!
  s3-copy!]

 [entrypoint
  exit-when-finished-nonzero-on-exception]

 [build.env
  env-or-throw]

 [files
  assert-file-exists
  copy-file!
  create-directory-unless-exists!
  delete-file!
  delete-file-if-exists!
  download-file!
  file-exists?
  filename
  find-files
  project-root-directory]

 [input
  interactive?
  letter-options-prompt
  read-line-with-prompt
  yes-or-no-prompt]

 [output
  announce
  error
  pretty-print-exception
  safe-println]

 [shell
  sh
  sh*]

 [steps
  step])

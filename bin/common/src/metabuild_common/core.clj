(ns metabuild-common.core
  (:require [metabuild-common.aws :as aws]
            [metabuild-common.entrypoint :as entrypoint]
            [metabuild-common.env :as build.env]
            [metabuild-common.files :as files]
            [metabuild-common.input :as input]
            [metabuild-common.misc :as misc]
            [metabuild-common.output :as output]
            [metabuild-common.shell :as shell]
            [metabuild-common.steps :as steps]
            [potemkin :as p]))

;; since this file is used pretty much everywhere, this seemed like a good place to put this.
(set! *warn-on-reflection* true)

(comment aws/keep-me
         entrypoint/keep-me
         build.env/env
         files/keep-me
         input/keep-me
         misc/keep-me
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
  file-size
  filename
  find-files
  nio-path
  project-root-directory
  temporary-file]

 [input
  interactive?
  letter-options-prompt
  read-line-with-prompt
  yes-or-no-prompt]

 [misc
  varargs]

 [output
  announce
  error
  format-bytes
  pretty-print-exception
  safe-println]

 [shell
  sh
  sh*]

 [steps
  step])

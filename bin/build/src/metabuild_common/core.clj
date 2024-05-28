(ns metabuild-common.core
  (:require
   [metabuild-common.entrypoint :as entrypoint]
   [metabuild-common.env :as build.env]
   [metabuild-common.files :as files]
   [metabuild-common.input :as input]
   [metabuild-common.misc :as misc]
   [metabuild-common.output :as out]
   [metabuild-common.shell :as shell]
   [metabuild-common.steps :as steps]
   [potemkin :as p]))

;; since this file is used pretty much everywhere, this seemed like a good place to put this.
(set! *warn-on-reflection* true)

(comment entrypoint/keep-me
         build.env/env
         files/keep-me
         input/keep-me
         misc/keep-me
         out/keep-me
         shell/keep-me
         steps/keep-me)

(p/import-vars
 [entrypoint
  exit-when-finished-nonzero-on-exception]

 [build.env
  env-or-throw]

 [files
  absolute?
  assert-file-exists
  copy-file!
  create-directory-unless-exists!
  delete-file-if-exists!
  download-file!
  file-exists?
  file-size
  filename
  find-files
  nio-path
  project-root-directory
  temporary-file
  zip-directory->file]

 [input
  interactive?
  letter-options-prompt
  read-line-with-prompt
  yes-or-no-prompt]

 [misc
  parse-as-keyword
  varargs]

 [out
  announce
  error
  pretty-print-exception
  safe-println]

 [shell
  sh
  sh*]

 [steps
  step])

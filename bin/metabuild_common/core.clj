(ns metabuild-common.core
  (:require [metabuild-common
             [entrypoint :as entrypoint]
             [files :as files]
             [output :as output]
             [shell :as shell]
             [steps :as steps]]
            [potemkin :as p]))

(comment entrypoint/keep-me
         files/keep-me
         output/keep-me
         shell/keep-me
         steps/keep-me)

(p/import-vars
 [entrypoint
  exit-when-finished-nonzero-on-exception]

 [files
  assert-file-exists
  copy-file!
  create-directory-unless-exists!
  delete-file!
  file-exists?
  find-files]

 [output
  announce
  error
  safe-println]

 [shell
  sh
  sh*]

 [steps
  step])

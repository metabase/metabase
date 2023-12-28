## i18n info

#### Building the backend pot file

Building the backend pot file can be done from the command line (from the project root directory):

```shell
❯ clojure -X:build:build/i18n
Created pot file at  cli.pot
Found 1393 forms for translations
Grouped into 1313 distinct pot entries
```

This is called from `update-translation-template` which builds frontend, backend, and automagic dashboard pot files and then merges them into one artifact with `msgcat`.

##### Developer information

We use a custom script to build up our backend pot (po template) file. Start a repl from this folder and the work is done in the `src/i18n/enumerate.clj` file.

It uses the very helpful library [Grasp](https://github.com/borkdude/grasp) to use a spec and a list of sources to find all uses of `trs`, `tru`, etc. It returns the forms found from the source, along with metadata that includes the filenames and line numbers.

```clojure
enumerate=> (def single-file (str u/project-root-directory "/src/metabase/util.clj"))
#'i18n.enumerate/single-file
enumerate=> (map (juxt meta identity)
                 (g/grasp single-file ::translate))
([{:line 81,
   :column 13,
   :uri "file:/Users/dan/projects/work/metabase/src/metabase/util.clj"}
  (trs
   "Maximum memory available to JVM: {0}"
   (format-bytes (.maxMemory (Runtime/getRuntime))))]
 [{:line 313,
   :column 33,
   :uri "file:/Users/dan/projects/work/metabase/src/metabase/util.clj"}
  (tru "Timed out after {0}" (format-milliseconds timeout-ms))]
 [{:line 504,
   :column 26,
   :uri "file:/Users/dan/projects/work/metabase/src/metabase/util.clj"}
  (tru "Not something with an ID: {0}" (pr-str object-or-id))])
```

Pot files can only have a single entry for each string, so these are grouped by the message and then we use the [org.fedorahosted.tennera.jgettext](https://github.com/zanata/jgettext) library to emit the pot file.

You can build quick pot files with the helpful function `create-pot-file!`

```clojure
enumerate=> (create-pot-file! single-file "pot.pot")
Created pot file at  pot.pot
{:valid-usages 3, :entry-count 4, :bad-forms ()}
```

which will output

```
# Copyright (C) 2022 Metabase <docs@metabase.com>
# This file is distributed under the same license as the Metabase package
#, fuzzy
msgid ""
msgstr ""
"Project-Id-Version: 1.0\n"
"Report-Msgid-Bugs-To: docs@metabase.com\n"
"POT-Creation-Date: 2022-07-22 14:03-0500\n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Content-Transfer-Encoding: 8bit\n"

#: /Users/dan/projects/work/metabase/src/metabase/sync/analyze/fingerprint/fingerprinters.clj
msgid "Error generating fingerprint for {0}"
msgstr ""

#: metabase/util.clj:81
msgid "Maximum memory available to JVM: {0}"
msgstr ""

#: metabase/util.clj:313
msgid "Timed out after {0}"
msgstr ""

#: metabase/util.clj:504
msgid "Not something with an ID: {0}"
msgstr ""
```

###### Overrides

You'll note that we defined a single file `"/src/metabase/util.clj"` but ended up with an entry from `fingerprinters.clj`. This is because that usage of `trs` is inside of a macro which emits a defrecord. The quoting means that the form doesn't actually match our spec since it has more sequence stuff:

```clojure
user=> '`(trs "foobar")
(clojure.core/seq (clojure.core/concat (clojure.core/list (quote user/trs)) (clojure.core/list "foobar")))
```

More information in the [grasp issue](https://github.com/borkdude/grasp/issues/28). A quick workaround is just including this manual override.

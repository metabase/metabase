## Build Backend Licenses

This provides a single namespace `mb.licenses` to look through all jar dependencies for license information and concatenate them all into a single file.

### Example usage:

```bash
CLASSPATH=$(lein with-profile -dev,+oss,+include-all-drivers classpath)

BACKFILL=$(cat overrides.edn)

clj -X mb.licenses/process \
    :classpath \"$CLASSPATH\" \
    :backfill "$BACKFILL" \
    :output-filename "\"../../backend-licenses.txt\""
```

Or all on one line:

`clj -X mb.licenses/process :classpath \"$(cd ../.. && lein with-profile -dev,+include-all-drivers classpath | tail -n1)\" :backfill "\"overrides.edn\"" :output-filename "\"backend-licenses-oss.txt\""`

NOTE: (tail -n1) is necessary as startup gets pretty chatty

The program will concatenate all licenses found, and write to std-err information about licenses it cannot find:

```bash
dan@dan-mbp metabase % bin/build-licenses.sh
org.opensaml:opensaml-security-impl  : No license information found.
colorize:colorize  : No license information found.
net.jcip:jcip-annotations  : No license information found.
org.clojure:tools.macro  : No license information found.
com.onelogin:java-saml-core  : No license information found.
...
License information for 194 libraries written to  backend-licenses.txt
```

The final line with a summary is written to std-out.

### Exit code

The program's exit code will be 1 if it detected any jars that it could not identify license information, and 0 if all jars on the classpath could be associated with a license.

## Algorithm to find licenses

```clojure
(or (license-from-jar (JarFile. jar-filename))
    (license-from-backfill coords backfill)
    (when-let [{:keys [name url]} (pom->licenses pom-xml)]
      (str name ": " url)))
```

The steps are:
1. Look for a license file ("LICENSE" "LICENSE.txt" "META-INF/LICENSE" "META-INF/LICENSE.txt" "license/LICENSE") in the jar, and use that literal text
2. Look in the backfill information for a license for the group or group and artifact. This can either be literal text or a filename for a resource on the classpath.
3. Finally, if none of the above steps produce a license, look in the pom for license information and use this. Looks for the first license and uses the name and url attributes if present.

## Supplying extra information

You can provide `:backfill` information to supplement the available license information, as these all seem to be conventions that are only sometimes followed. The format of the edn should be as follows:

```clojure
{:override/group   ;; match on just the group so don't need to enumerate artifacts
 {"org.clojure" {:resource "EPL.txt"}
  "io.netty" {:resource "apache2_0.txt"}}

 "hiccup" {"hiccup" {:resource "EPL.txt"}} ;; pointing to a resource
 "stencil" {"stencil" "License text here"} ;; literal license text in-line
 "colorize" {"colorize" {:resource "EPL.txt"}}}
 ```

 The lookup will be by group and artifact first, and then by group to see if there is a group override.


## Output

The output will be as follows (full license text is truncated)

```
The following software may be included in this product:  org.apache.commons : commons-math3 . This software contains the following license and notice below:


                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

[...]

----------

The following software may be included in this product:  ring : ring-core . This software contains the following license and notice below:


The MIT License: http://opensource.org/licenses/MIT


----------

[...]

```

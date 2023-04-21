## Build Metabase Tooling

This project is to build the Metabase jar. It can be called standalone and is also called from the release project
when creating releases.

## License Information

We create license information for all of our dependencies, both frontend and backend, and package them in our jar.

Tests will run in CI that we have license information for all dependencies. If you see these failing, an easy way to
get a report of dependencies without license information can be obtained by running

```shell
clojure -X:build:build/list-without-license
...
All dependencies have licenses
```

If there are dependencies with missing license information you will see output like

```shell
clojure -X:build:build/list-without-license
$ "clojure" "-A:ee" "-Spath"
Missing License: /Users/dan/.m2/repository/org/eclipse/jetty/jetty-webapp/9.3.19.v20170502/jetty-webapp-9.3.19.v20170502.jar
Missing License: /Users/dan/.m2/repository/org/fusesource/leveldbjni/leveldbjni-all/1.8/leveldbjni-all-1.8.jar
Missing License: /Users/dan/.m2/repository/org/opensaml/opensaml-security-impl/3.4.5/opensaml-security-impl-3.4.5.jar
Missing License: /Users/dan/.m2/repository/colorize/colorize/0.1.1/colorize-0.1.1.jar
```

You can check the overrides file (resources/overrides.edn) and add the license information there, or perhaps improve
the license discovery mechanism in the code.

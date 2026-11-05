# MAGE - Development Automation

Run `./bin/mage` to list your tasks. All of them support `-h` to learn more and show examples.

All tasks support a `-h` option and will print their usage info.

```shell
$ ./bin/mage
   ███╗   ███╗ █████╗  ██████╗ ███████╗
   ████╗ ████║██╔══██╗██╔════╝ ██╔════╝
   ██╔████╔██║███████║██║  ███╗█████╗
   ██║╚██╔╝██║██╔══██║██║   ██║██╔══╝
   ██║ ╚═╝ ██║██║  ██║╚██████╔╝███████╗
   ╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
    The Metabase Automation Genius Engine

The following tasks are available:

Format & lint
  cljfmt-staged  Runs cljfmt on staged files
  kondo          Runs Kondo against a file, directory, or everything we usually lint
  ...

Local dev
  jar-download   Download (and optionally run) jar for a metabase version or branch
  start-db       Start a db on a default port in docker
  ...
$ ./bin/mage ls kondo
<lists only tasks whose name contains "kondo", including private ones>
$ ./bin/mage kondo -h
<prints help for easily running kondo>
```

### mage Autocomplete

Run `./bin/mage setup-autocomplete` and follow the instructions to set up autocomplete in your terminal.

### Adding a task

Add the task to the `:tasks` map in `bb.edn`. A public task (name not starting with `-`) needs:

- `:group`: the section it appears under in `./bin/mage`. Use one of the names in `mage.util/task-groups`. If none fits, add a new name to that vector; its position sets the section order. `mage.core-test/public-task-has-group-test` fails if a public task has no `:group` or one that isn't in the vector.
- `:doc`: put the useful part in the first sentence. The listing shows only the first sentence, cut to the terminal width. `-h` shows the full text.
- `:examples`: `mage.core-test/bb-task-has-example-test` checks that `-h` prints them.

```clojure
  my-task
  {:group "Local dev"
   :doc "Does the thing. More detail that only `-h` shows."
   :examples [["./bin/mage my-task" "Does the thing"]]
   :requires [[mage.my-task :as my-task]]
   :task (task! (my-task/run! parsed))}
```

Private tasks (names starting with `-`) don't need a `:group`. They are hidden from `./bin/mage` and appear in `./bin/mage ls`.

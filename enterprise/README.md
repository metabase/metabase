# Metabase Enterprise Edition

## License

Usage of files in this directory and its subdirectories, and of Metabase Enterprise Edition features, is subject to
the [Metabase Commercial License](https://www.metabase.com/license/commercial/), and conditional on having a
fully-paid-up license from Metabase. Access to files in this directory and its subdirectories does not constitute
permission to use this code or Metabase Enterprise Edition features.

Unless otherwise noted, all files Copyright © 2021 Metabase, Inc.

## Running it

### Front-end

```sh
MB_EDITION=ee yarn build-hot
```

### Back-end

You need to add the `:ee` profile to the leiningen command to run Metabase Enterprise Edition.

```clj
lein with-profile +ee run
```

```clj
lein with-profile +ee uberjar
```

```clj
lein with-profile +ee repl
```

In Emacs/CIDER you can customize the `lein repl` command used to start the REPL by passing a prefix argument, e.g.

```emacs-lisp
C-u M-x cider-jack-in
```

or, programatically:

```emacs-lisp
(cider-jack-in '(4))
```

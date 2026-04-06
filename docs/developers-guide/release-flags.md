# Release Flags

The purpose of Metabase release flags is to allow developers to progressively merge good, tested, but incomplete code to master and avoid large, long-running feature branches. Release flags should be temporary, and should be removed at the completion of a project. Release flags are not required. You can do a traditional feature branch approach with just a PR, or even better, merge small, independently and immediately useful code to master. But release flags are available as an option to avoid long-running feature branches when necessary.

### Lifecycle

1. Create a PR which adds a new, unique flag to `release-flags/config.edn` and update `metabase-types/api/release-flg.ts` to include the new key. Have it reviewed and merged.
2. Subsequent PRs for the feature should have all code behind the release flag. The code should be disabled at the highest possible level to reduce the number of places where the flag is invoked.
3. When you are ready to launch your feature, create a PR which removes the flag from `release-flags/config.edn` and `metabase-types/api/release-flg.ts`. This will trigger linting and TypeScript errors. Remove the conditionals using the flag. Have it reviewed and merged. You’re done!

## Protecting Code

Develop your code as normal. Require it from namespaces. This will load your code as normal. However, you should protect the call sites of the functions in your code.

Throughout development, all code that should be behind the release flag should be disabled at the highest possible level in the calling code. Good encapsulation principles should be used to minimize the number of needed release flag conditionals. Nesting release flags should be avoided wherever possible. Care should be taken that release flagging code should not diminish the maintainability or readability of code. During development, you can toggle release flags from the ui at `/release-flags` or via the API at `PUT /api/release-flags`.

💡 If you find yourself needing to use the same flag in lots of places, you may need to:
1. Reconsider whether a release flag is appropriate for this feature, or
2. Consider whether your feature code could be better encapsulated

### Clojure

The main way to protect code at a call site is with `metabase.release-flags.core/has-release-flag?`.

Example:

```clojure
(when (release-flags/has-release-flag? :my-new-feature)
 ...)
```

A new feature often requires new namespaces to be created to support the feature. That code will be committed to master much more quickly than with a feature branch approach. However, the code is not ready to be called normally. This creates a conflict: There is code in master that is not ready to be called. In order to prevent/detect code that incorrectly calls this code, a namespace should also add a single line to the end.


```clojure
(release-flags/guard-namespace! :my-new-feature)
```

This function will instrument the functions in the namespace with code that tacks whether the release flag was enabled. If the code was called but the release flag wasn’t enabled, it will fail a test, preventing it from merging to master. This line should be removed when the feature is released.

A clj-kondo rule will check that `has-release-flag?` and `guard-namespace!` is only called with flags listed in `release-flags/config.edn`.

When you are writing new tests for your feature, you don't want them to fail. You can tell the release flag system to allow calls to your functions by adding this line to the top of the test namespace:

```clojure
(use-fixtures :once (release-flags/bypass-guard-fixture <my-release-flag>))
```

API endpoints that you want to protect behind a release flag should use `check-404` to fail requests as if the route were not even there. Here's an example:

```clojure
(api.macros/defendpoint :get "/" :- [:map
                                     ["id" :int]
                                     ["type" :string]
                                     ["setup" :string]
                                     ["punchline" :string]]
  "Return the joke of the day."
  []
  (api/check-404 (flags/has-release-flag? :joke-of-the-day)) ;; this line at the top of the endpoint
  (rand-nth (jokes/jokes)))
```

### TypeScript

TypeScript code is toggled with `hasReleaseFlag("flag-name")`.

```ts
import { hasReleaseFlag } from "metabase/lib/release-flags";

...

if (hasReleaseFlag("cool-feature")) {
  return <CoolFeature />;
}
```

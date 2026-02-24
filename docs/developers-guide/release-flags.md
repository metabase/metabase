# Release Flags

The purpose of Metabase release flags is to allow developers to progressively merge good, tested, but incomplete code to master and avoid large, long-running feature branches. Release flags should be temporary, and should be removed at the completion of a project.

At the beginning of any long-running project that intends to use a release flag, a developer should open a pr adding the new release flag to the `release-flags.json` file with a unique name and a brief description.

Throughout development, all code that should be behind the release flag should be disabled at the highest possible level in the calling code. Good encapsulation principles should be used to minimize the number of needed release flags. Nesting release flags should be avoided wherever possible. Care should be taken that release flagging code should not diminish the maintainability or readability of code.

Incomplete feature code will be loaded as normal. But it should not be called outside of a release flag conditional.

Example:

```clojure
(when (has-release-flag :my-new-feature)
 ...)
```

```tsx
const hasCoolFeature = useHasReleaseFlag('cool-feature');

if (hasCoolFeature) {
  return <CoolFeature />;
}

return <OldFeature />;

```

A new feature often requires new namespaces to be created to support the feature. That code will be committed to master much more quickly than with a feature branch approach. However, the code is not ready to be called normally. This creates a conflict: There is code in master that is not ready to be called. In order to prevent/detect code that incorrectly calls this code, a namespace should also add a single line to the end.

```clojure
(protect-ns-release-flag :my-new-feature)
```

This function will instrument the functions in the namespace with code that tacks whether the release flag was enabled. If the code was called but the release flag wasn’t enabled, it will fail a test, preventing it from merging to master. This line should be removed when the feature is released. Similar code will happen in TypeScript.

A clj-kondo rule will check that `has-release-flag` is only called with flags listed in `release-flags.json`.

### Lifecycle

1. Create a PR which adds a new, unique flag to `release-flags.json` . Have it reviewed and merged.
2. Subsequent PRs for the feature should have all code behind the release flag. The code should be disabled at the highest possible level to reduce the number of places where the flag is invoked.
3. Clojure
    1. Creating a new namespace.
    Creating a namespace is done as normal. It should be required as normal in all of the namespaces that might depend on the code. The only difference is that `protect-ns-release-flag` should be called at the end of the file.
    2. Calling code for the new feature
    Whenever you call code that should be protected by a release flag, wrap it in a conditional that calls `has-release-flag` .
4. Create a PR which removes the flag from `release-flags.json`. This will trigger linting and TypeScript errors. Remove the conditionals using the flag. Have it reviewed and merged. You’re done!

# Embedding SDK

## Build
```
$ yarn build-embedding-sdk
```

Build results are located at `<root>/resources/embedding-sdk`

## Local development

Run dev build in watch mode:

```
$ yarn build:cljs
```
```
$ yarn embedding-sdk:generate-package
```
```
$ yarn build-embedding-sdk:watch
```

Then in `<root>/resources/embedding-sdk` run
```
$ yarn link
```

In the host app:

```
$ yarn link @metabase/embedding-sdk-react
```

## Release

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `package.template.json` + current date and commit short hash.

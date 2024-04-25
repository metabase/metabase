# Embedding SDK

## Build

```
$ yarn build-embedding-sdk
```

Build results are located at `<root>/resources/embedding-sdk`

## Local development

Run dev build in watch mode:

```
$ yarn build-release:cljs
```

```
$ yarn build-embedding-sdk:watch
```

Then target `<root>/resources/embedding-sdk` folder as a file dependency in a host application:

```
"dependencies": {
    "@metabase/embedding-sdk-react": "file:../../metabase/resources/embedding-sdk"
}
```

## Release

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `package.template.json` + current date and commit short hash.

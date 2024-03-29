# Embedding SDK

### Build
`yarn build-embedding-sdk`

Build results are located at `<root>/resources/embedding-sdk`

### Dev build with watch mode
`yarn build:cljs`

`yarn build-embedding-sdk:watch`

### Release

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `./package.template.json` + current date and short commit hash.

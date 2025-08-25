# Embedding SDK Shared

This folder contains shared code between Embedding SDK Bundle and Embedding SDK Package.

### Important

Code in this directory should carefully reference external code, including code of the main app and 3rd party dependencies. The reason is that we want keep the Embedding SDK Package bundle as small as possible. To control it, a special eslint rule `no-external-references-for-sdk-package-code` is defined in `enterprise/frontend/src/.eslintrc.js`

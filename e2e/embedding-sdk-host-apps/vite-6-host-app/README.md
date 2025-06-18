# Vite@6 Host App

Special setup notes:
- The app reads `process.env.BUNDLE_FORMAT` and if it has the `cjs` value - sets the `mainFields: ['main']` to test CJS bundle of Embedding SDK

import react from '@vitejs/plugin-react'
import { defineConfig } from "vite";
import tsconfigPaths from 'vite-tsconfig-paths'

const aliases = {
  assets: [
    '/Users/ryan/projects/metabase/resources/frontend_client/app/assets'
  ],
  fonts: [
    '/Users/ryan/projects/metabase/resources/frontend_client/app/fonts'
  ],
  metabase: [ '/Users/ryan/projects/metabase/frontend/src/metabase' ],
  'metabase-lib': [ '/Users/ryan/projects/metabase/frontend/src/metabase-lib' ],
  'metabase-enterprise': [
    '/Users/ryan/projects/metabase/enterprise/frontend/src/metabase-enterprise'
  ],
  'metabase-types': [ '/Users/ryan/projects/metabase/frontend/src/metabase-types' ],
  'metabase-dev': [ '/Users/ryan/projects/metabase/frontend/src/metabase/dev.js' ],
  cljs: [ '/Users/ryan/projects/metabase/target/cljs_dev' ],
  __support__: [ '/Users/ryan/projects/metabase/frontend/test/__support__' ],
  e2e: [ '/Users/ryan/projects/metabase/e2e' ],
  style: [
    '/Users/ryan/projects/metabase/frontend/src/metabase/css/core/index'
  ],
  icepick: [ '/Users/ryan/projects/metabase/node_modules/icepick/icepick.min' ],
  'ee-plugins': [ '/Users/ryan/projects/metabase/frontend/src/metabase/lib/noop' ],
  'ee-overrides': [ '/Users/ryan/projects/metabase/frontend/src/metabase/lib/noop' ],
  embedding: [ '/Users/ryan/projects/metabase/enterprise/frontend/src/embedding' ],
  'embedding-sdk': [
    '/Users/ryan/projects/metabase/enterprise/frontend/src/embedding-sdk'
  ]
};

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      ...aliases,
    },
  },
  test: {
    define: {
      "react": "React",
    },
    resolve: {
      alias: aliases,
    },
    alias: aliases,
    environment: 'jsdom',
    compilerOptions: {
      paths: {
        ...aliases,
      },
    }
  },
});

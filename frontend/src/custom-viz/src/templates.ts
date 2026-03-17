/* eslint-disable metabase/no-literal-metabase-strings */

export function generatePackageJson(name: string): string {
  const pkg = {
    name,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      build: "vite build",
      dev: "vite build --watch & vite preview",
      "type-check": "tsc --noEmit",
    },
    devDependencies: {
      "@metabase/custom-viz": "^0.0.1",
      "@types/react": "^19.2.14",
      react: "^19.1.0",
      typescript: "^5.9.3",
      vite: "^8.0.0",
    },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

export function generateViteConfig(): string {
  return `\
import { resolve } from "path";
import { createServer } from "http";
import { defineConfig } from "vite";

/**
 * Vite plugin that replaces \`react\` and \`react/jsx-runtime\` imports with
 * virtual modules that read from Metabase's \`window.__METABASE_VIZ_API__\`.
 *
 * This is necessary because the ES module output format cannot use
 * \`output.globals\`, and bare \`import 'react'\` would fail in the browser.
 */
function metabaseVizExternals() {
  const VIRTUAL_REACT = "\\0virtual:react";
  const VIRTUAL_JSX_RUNTIME = "\\0virtual:react/jsx-runtime";

  return {
    name: "metabase-viz-externals",
    enforce: "pre" as const,

    resolveId(source) {
      if (source === "react") {
        return VIRTUAL_REACT;
      }
      if (source === "react/jsx-runtime") {
        return VIRTUAL_JSX_RUNTIME;
      }
      return null;
    },

    load(id) {
      if (id === VIRTUAL_REACT) {
        return [
          "const React = window.__METABASE_VIZ_API__.React;",
          "export default React;",
          "export const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createElement, Fragment } = React;",
        ].join("\\n");
      }
      if (id === VIRTUAL_JSX_RUNTIME) {
        return [
          "const jsxRuntime = window.__METABASE_VIZ_API__.jsxRuntime;",
          "export const { jsx, jsxs, Fragment } = jsxRuntime;",
        ].join("\\n");
      }
      return null;
    },
  };
}

const NOTIFY_PORT = 5175;

/**
 * Vite plugin that starts a tiny SSE server and sends a "reload" event
 * to all connected clients after each rebuild completes.
 * Metabase's frontend connects to this to live-reload the custom viz.
 */
function metabaseNotifyReload() {
  const clients = new Set<import("http").ServerResponse>();
  let server: ReturnType<typeof createServer> | null = null;

  return {
    name: "metabase-notify-reload",

    buildStart() {
      if (server) {
        return;
      }
      server = createServer((req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        clients.add(res);
        req.on("close", () => clients.delete(res));
      });
      server.listen(NOTIFY_PORT, () => {
        console.log(
          \`[metabase-notify] SSE server listening on http://localhost:\${NOTIFY_PORT}\`,
        );
      });
    },

    closeBundle() {
      for (const client of clients) {
        client.write("data: reload\\n\\n");
      }
      console.log(
        \`[metabase-notify] Build complete, notified \${clients.size} client(s)\`,
      );
    },
  };
}

export default defineConfig({
  plugins: [metabaseVizExternals(), metabaseNotifyReload()],
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["es", "iife"],
      fileName: (format) => format === "iife" ? "index.iife.js" : "index.js",
      name: "__customVizPlugin__",
    },
  },
  preview: {
    port: 5174,
    host: true,
    cors: true,
  },
});
`;
}

export function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2020",
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      declaration: true,
    },
    include: ["src"],
  };

  return JSON.stringify(config, null, 2) + "\n";
}

export function generateIndexTsx(name: string): string {
  return `\
import type {
  CreateCustomVisualization,
  CustomStaticVisualizationProps,
  CustomVisualizationProps,
} from "@metabase/custom-viz";

type Settings = {
  threshold?: number;
};

const createVisualization: CreateCustomVisualization<Settings> = () => {
  return {
    id: "${name}",
    getName: () => "${name}",
    minSize: { width: 1, height: 1 },
    defaultSize: { width: 2, height: 2 },
    isSensible({ cols, rows }) {
      return cols.length === 1 && rows.length === 1 && typeof rows[0][0] === "number";
    },
    checkRenderable(series, settings) {
      if (series.length !== 1) {
        throw new Error("Only 1 series is supported");
      }

      const [
        {
          data: { cols, rows },
        },
      ] = series;

      if (cols.length !== 1) {
        throw new Error("Query results should only have 1 column");
      }

      if (rows.length !== 1) {
        throw new Error("Query results should only have 1 row");
      }

      if (typeof rows[0][0] !== "number") {
        throw new Error("Result is not a number");
      }

      if (typeof settings.threshold !== "number") {
        throw new Error("Threshold setting is not set");
      }
    },
    settings: {
      threshold: {
        id: "1",
        title: "Threshold",
        widget: "number",
        getDefault() {
          return 0;
        },
        getProps() {
          return {
            options: {
              isInteger: false,
              isNonNegative: false,
            },
            placeholder: "Set threshold",
          };
        },
      },
    },
    VisualizationComponent,
    StaticVisualizationComponent,
  };
};

const VisualizationComponent = (props: CustomVisualizationProps<Settings>) => {
  const { height, series, settings, width } = props;
  const { threshold } = settings;
  const value = series[0].data.rows[0][0];

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  const emoji = value >= threshold ? "👍" : "👎";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width,
        height,
        fontSize: "10rem",
      }}
    >
      {emoji}
    </div>
  );
};

const StaticVisualizationComponent = (
  props: CustomStaticVisualizationProps<ThumbsVizSettings>,
) => {
  const width = 540;
  const height = 360;
  const { series, settings } = props;
  const { threshold } = settings;
  const value = series[0].data.rows[0][0];

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  const emoji = value >= threshold ? "👍" : "👎";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width,
        height,
        fontSize: "10rem",
      }}
    >
      {emoji}
    </div>
  );
};

export default createVisualization;
`;
}

export function generateGitignore(): string {
  return `\
node_modules/
.DS_Store
# dist must be committed
`;
}

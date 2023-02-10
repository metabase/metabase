const esbuild = require("esbuild");

const args = process.argv.slice(2);
const watch = args.includes("--watch");

const plugins = [
  {
    name: "no-side-effects",
    setup(build) {
      build.onResolve(
        { filter: /.*/, namespace: "file" },
        async ({ path, ...options }) => {
          if (options.pluginData) {
            return;
          }
          options.pluginData = true;

          const result = await build.resolve(path, {
            ...options,
            namespace: "noRecurse",
          });
          return { ...result, sideEffects: false };
        },
      );
    },
  },
];

let opts = {
  entryPoints: ["frontend/src/metabase/static-viz/index.jsx"],
  bundle: true,
  target: "es2016",
  outfile: "resources/frontend_client/app/dist/lib-static-viz.bundle.js",
  logLevel: "silent",
  plugins,
  define: {
    global: "globalThis",
  },
};

if (watch) {
  opts = {
    ...opts,
    watch,
    sourcemap: "inline",
  };
}

if (!watch) {
  opts = {
    ...opts,
    minify: true,
  };
}

const build = async () => {
  await esbuild.build(opts);

  if (watch) {
    process.stdin.on("close", () => {
      process.exit(0);
    });

    process.stdin.resume();
  }
};

build();

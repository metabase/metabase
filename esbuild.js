const path = require("path");
const fs = require("fs");

const esbuild = require("esbuild");

const alias = require("esbuild-plugin-alias");

const resolvePath = x => path.resolve(__dirname, x);

const output = fs.readFileSync(resolvePath("fixtures/output.js"), "utf-8");

esbuild
  .build({
    entryPoints: [resolvePath("fixtures/input.js")],
    bundle: true,
    plugins: [
      alias({
        "settings.env": resolvePath("fixtures/settings.dev.js"),
      }),
    ],
    write: false,
  })
  .then(res => {
    done(assert.deepStrictEqual(res.outputFiles[0].text, output));
  })
  .catch(err => {
    done(err);
  });

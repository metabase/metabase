const dependencyTree = require("dependency-tree");
const gitChangedFiles = require("git-changed-files");
const _ = require("underscore");

const tree = dependencyTree({
  filename: "./frontend/src/metabase/static-viz/index.js",
  directory: "./frontend/src",
  webpackConfig: "./webpack.config.js", // optional
  filter: path => path.indexOf("node_modules") === -1, // optional
  nonExistent: [], // optional
  isListForm: true,
});

(async () => {
  const { committedFiles, unCommittedFiles } = await gitChangedFiles();

  const changedFiles = [...committedFiles, ...unCommittedFiles].map(
    file => `${__dirname}/${file}`,
  );

  const staticVizChange = _.intersection(changedFiles, tree).length > 0;
  console.log(staticVizChange);
})();

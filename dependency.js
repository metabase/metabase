const stats = require("./compilation-stats.json");
const gitChangedFiles = require("git-changed-files");
const _ = require("underscore");

const modules = stats.modules
  .filter(module => module.type !== "hidden modules")
  .map(module => module.nameForCondition);

(async () => {
  const { committedFiles, unCommittedFiles } = await gitChangedFiles();

  const changedFiles = [...committedFiles, ...unCommittedFiles].map(
    file => `${__dirname}/${file}`,
  );

  const staticVizChange = _.intersection(changedFiles, modules).length > 0;
  console.log(staticVizChange);
})();

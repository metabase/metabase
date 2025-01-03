// eslint-disable-next-line import/no-commonjs
module.exports = {
  gitRawCommitsOpts: {
    grep: "(sdk)",
  },
  options: {
    preset: "angular",
    pkg: {
      path: "enterprise/frontend/src/embedding-sdk/package.template.json",
    },
    tagPrefix: "embedding-sdk-",
    transform: function (commit, cb) {
      if (typeof commit.gitTags === "string") {
        const tagPrefix = "embedding-sdk-";
        const rtag = new RegExp(`tag:\\s*[=]?${tagPrefix}(.+?)[,)]`, "gi");
        const match = rtag.exec(commit.gitTags);
        rtag.lastIndex = 0;
        if (match) {
          commit.version = match[1];
        }
      }
      if (commit.committerDate) {
        const dateFormatter = Intl.DateTimeFormat("sv-SE", {
          timeZone: "UTC",
        });
        commit.committerDate = dateFormatter.format(
          new Date(commit.committerDate),
        );
      }

      if (hasBackportPrefix(commit)) {
        const { groups } =
          /\"(?<type>\w*)(?:\((?<scope>[\w\$\.\-\* ]*)\))?\: (?<message1>.*)\"(?<message2>.*)$/.exec(
            commit.header,
          );
        commit = {
          ...commit,
          type: groups.type,
          scope: groups.scope,
          subject: groups.message1 + groups.message2,
        };
      }

      cb(null, commit);
    },
  },
};

function hasBackportPrefix(commit) {
  return commit.header.startsWith("🤖 backported");
}

/**
 * Builds the branch matrix for .github/workflows/docs-nav-seed.yml.
 *
 * Each matrix entry maps a metabase branch to the docs.metabase.github.io nav file that seeds
 * it, and the "/docs/<version>/" URL prefix to strip out of that file's urls.
 *
 * Takes the same comma separated branch list as the workflow's `branches` input, as a CLI arg or
 * via the BRANCHES_INPUT env var. Pass "all" for the default list (release-x.44.x through
 * release-x.63.x plus master). One of these must be set to a non-empty value, or the script
 * throws — there's no implicit default.
 *
 *   bun .github/scripts/docs-nav-seed-matrix.ts "all"
 *   bun .github/scripts/docs-nav-seed-matrix.ts "release-x.44.x,master"
 *
 * Echoes out json that looks like this:
```
{
  include: [
    { branch: 'master', source_file: '_data/docs/nav/latest.yml', url_prefix: '/docs/latest/' },
    { branch: 'release-x.44.x', source_file: '_data/docs/nav/v044.yml', url_prefix: '/docs/v0.44/' },
    // ...
```
 */

type MatrixEntry = {
  branch: string;
  source_file: string;
  url_prefix: string;
};

function entryForBranch(branch: string): MatrixEntry {
  if (branch === "master") {
    return {
      branch: "master",
      source_file: "_data/docs/nav/latest.yml",
      url_prefix: "/docs/latest/",
    };
  }

  const match = branch.match(/^release-x\.(\d+)\.x$/);
  if (!match) {
    throw new Error(
      `docs-nav-seed-matrix: branch "${branch}" is not "master" or "release-x.<version>.x"`,
    );
  }
  const version = match[1];
  const padded = version.padStart(3, "0");
  return {
    branch,
    source_file: `_data/docs/nav/v${padded}.yml`,
    url_prefix: `/docs/v0.${version}/`,
  };
}

function defaultBranches(): string[] {
  const branches = ["master"];
  for (let v = 44; v <= 63; v++) {
    branches.push(`release-x.${v}.x`);
  }
  return branches;
}

const branchesInput = process.argv[2] || process.env.BRANCHES_INPUT || "";

if (!branchesInput) {
  throw new Error(
    'docs-nav-seed-matrix: no branches given. Pass a comma separated branch list as a CLI arg or BRANCHES_INPUT env var, or "all" for the default list.',
  );
}

const branches =
  branchesInput === "all"
    ? defaultBranches()
    : branchesInput.split(",").map((b) => b.trim());

const include = branches.map(entryForBranch);

process.stdout.write(JSON.stringify({ include }) + "\n");

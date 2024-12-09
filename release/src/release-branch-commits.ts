import {$} from 'zx';

export async function getReleaseBranchCommits(
  { versionNumber }: { versionNumber: number }
) {
  const lastMajorVersion = versionNumber - 1;

  // find where the last branch split off of master
  const { stdout: branchCommit } = await $`git merge-base origin/release-x.${lastMajorVersion}.x master`;
  const { stdout: commitMessages } = await $`git log ${branchCommit.trim()}..origin/release-x.${versionNumber}.x --pretty='format:%s'`;

  return commitMessages.split('\n')
}

const versionNumber = Number(process.argv[2]);

const commits = await getReleaseBranchCommits({ versionNumber });

console.log(JSON.stringify(commits, null, 2));

// CLI runner for release-branch-commits. Called from the set-milestone
// workflow as `tsx release/src/release-branch-commits-run.ts <major>`.
import { getReleaseBranchCommits } from './release-branch-commits';

const versionNumber = Number(process.argv[2]);

const commits = await getReleaseBranchCommits({ versionNumber });

console.log(JSON.stringify(commits, null, 2));

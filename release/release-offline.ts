/* eslint-disable no-console */

/**
 * Note: This is a backup and failsafe if you cannot use the release github actions in CI for some reason.
 * The environment consistency and observability of the release process is very important, so
 * you should only use this script if absolutely necessary, and you cannot use CI for some very
 * good reason.
 */

import "dotenv/config";
import { Octokit } from "@octokit/rest";
import "zx/globals";
import { $ } from "zx";
$.verbose = false;

import {
  isValidVersionString,
  hasBeenReleased,
  isValidCommitHash,
  isEnterpriseVersion,
  getMajorVersion,
  isLatestRelease,
  getVersionInfo,
  publishRelease,
  closeMilestone,
  openNextMilestones,
  versionRequirements,
} from "./src";

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  AWS_S3_DOWNLOADS_BUCKET,
  AWS_S3_STATIC_BUCKET,
  AWS_CLOUDFRONT_DOWNLOADS_ID,
  AWS_CLOUDFRONT_STATIC_ID,
  AWS_S3_RELEASE_SECRET_ACCESS_KEY,
  AWS_S3_RELEASE_ACCESS_KEY_ID,
  DOCKERHUB_OWNER,
  DOCKERHUB_RELEASE_USERNAME,
  DOCKERHUB_RELEASE_TOKEN,
} = process.env;

const github = new Octokit({ auth: GITHUB_TOKEN });

const JAR_PATH = "../target/uberjar";

const version = process.argv?.[2]?.trim();
const commit = process.argv?.[3]?.trim();
const step = process.argv?.[4]?.trim().replace("--", "");
const edition = isEnterpriseVersion(version) ? "ee" : "oss";

if (!isValidVersionString(version)) {
  error(
    "You must provide a valid version string as the first argument (e.g v0.45.6",
  );
}

if (!isValidCommitHash(commit)) {
  error("You must provide a valid commit hash as the second argument");
}

/**************************************************
          HELPERS
 **************************************************/

// mostly for type checking
function getGithubCredentials() {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    error("You must provide all github environment variables in .env-template");
    process.exit(1);
  }

  return { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO };
}

async function checkReleased() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  const hasThisVersionBeenReleased = await hasBeenReleased({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  if (hasThisVersionBeenReleased) {
    error(`Version ${version} has already been released`);
  }
}

async function checkJar() {
  // check if built jar exists
  const requiredFiles = [
    `${JAR_PATH}/metabase.jar`,
    `${JAR_PATH}/COMMIT-ID`,
    `${JAR_PATH}/SHA256.sum`,
  ];

  requiredFiles.forEach(file => {
    if (!fs.existsSync(file)) {
      error(`You must build the jar first. ${file} does not exist`);
    }
  });

  const versionProperties = (
    await $`jar xf ${JAR_PATH}/metabase.jar version.properties && cat version.properties`
  ).toString();

  console.log(chalk.green(`\n${versionProperties}\n`));

  if (!versionProperties.includes(`tag=${version}`)) {
    error(`This jar does not match the input version: ${version}`);
  }
}

function error(message) {
  console.error(chalk.red(`\n⚠️   ${message}\n`));
  process.exit(1);
}

/**************************************************
          BUILD STEP
 **************************************************/
async function build() {
  // check build environment
  const majorVersion = Number(getMajorVersion(version));
  const nodeVersion = (await $`node --version`).toString();
  const javaVersion = (await $`java -version`).toString();

  if (!nodeVersion.includes(`v${versionRequirements[majorVersion].node}`)) {
    error(
      `Node version must be v${versionRequirements[majorVersion].node}, you are running ${nodeVersion}`,
    );
  }

  if (
    !javaVersion.includes(
      `openjdk version "${versionRequirements[majorVersion].java}`,
    )
  ) {
    error(
      `Java version must be ${versionRequirements[majorVersion].java}, you are running ${javaVersion}`,
    );
  }

  const currentBranch = (await $`git branch --show-current`).toString().trim();

  console.log(
    chalk.blue(
      `\n🚀 Building ${edition} jar for ${version} from commit ${commit}...\n`,
    ),
  );

  try {
    await $`git fetch --all`;
    await $`git stash && git checkout ${commit}`;

    // build jar
    await $`../bin/build.sh :edition :${edition} :version ${version}`.pipe(
      process.stdout,
    );

    await $`git checkout -`;
    await $`echo ${commit} > ${JAR_PATH}/COMMIT-ID`;
    await $`shasum -a 256 ${JAR_PATH}/metabase.jar > ${JAR_PATH}/SHA256.sum`;

    console.log(
      chalk.blue(`\n✅ Built ${edition} jar for ${version} in ${JAR_PATH}`),
    );
  } catch (error) {
    console.error(error);
  } finally {
    await $`git checkout ${currentBranch}`;
  }
}

/**************************************************
          PUBLISH STEPS
***************************************************/

async function s3() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  await checkJar();

  const isLatest = await isLatestRelease({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  if (
    !AWS_S3_DOWNLOADS_BUCKET ||
    !AWS_S3_STATIC_BUCKET ||
    !AWS_S3_RELEASE_SECRET_ACCESS_KEY ||
    !AWS_S3_RELEASE_ACCESS_KEY_ID
  ) {
    error("You must provide all AWS environment variables in .env-template");
  }

  process.env.AWS_ACCESS_KEY_ID = AWS_S3_RELEASE_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY = AWS_S3_RELEASE_SECRET_ACCESS_KEY;

  // upload to s3

  const versionPath = edition === "ee" ? `enterprise/${version}` : version;

  console.log(chalk.blue(`\n⏳ Publishing ${version} to s3\n`));

  await $`aws s3 cp ${JAR_PATH}/metabase.jar s3://${AWS_S3_DOWNLOADS_BUCKET}/${versionPath}/metabase.jar`.pipe(
    process.stdout,
  );

  if (isLatest) {
    await $`aws s3 cp ${JAR_PATH}/metabase.jar s3://${AWS_S3_DOWNLOADS_BUCKET}/latest/metabase.jar`.pipe(
      process.stdout,
    );
  }

  if (!process.env.SKIP_CLOUDFRONT) {
    await $`aws cloudfront create-invalidation \
      --distribution-id ${AWS_CLOUDFRONT_DOWNLOADS_ID} \
      --paths /${versionPath}/metabase.jar`.pipe(process.stdout);
  }

  console.log(chalk.blue(`\n✅ Published ${version} to s3\n`));
}

async function docker() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  if (
    !DOCKERHUB_RELEASE_USERNAME ||
    !DOCKERHUB_RELEASE_TOKEN ||
    !DOCKERHUB_OWNER
  ) {
    error("You must provide all docker environment variables in .env-template");
  }

  await checkJar();

  console.log(chalk.blue(`\n⏳ Building docker image for ${version}\n`));

  await $`cp -r ${JAR_PATH}/metabase.jar ../bin/docker/`;

  const dockerRepo = edition === "ee" ? "metabase-enterprise" : "metabase";

  const dockerTag = `${DOCKERHUB_OWNER}/${dockerRepo}:${version}`;

  await $`docker build --tag ${dockerTag} ../bin/docker/.`.pipe(process.stdout);

  await $`docker login --username ${DOCKERHUB_RELEASE_USERNAME} -p ${DOCKERHUB_RELEASE_TOKEN}`;
  await $`docker push ${dockerTag}`.pipe(process.stdout);

  console.log(chalk.blue(`\n✅ Published ${dockerTag} to DockerHub\n`));

  const isLatest = await isLatestRelease({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  if (isLatest) {
    const latestTag = `${DOCKERHUB_OWNER}/${dockerRepo}:latest`;
    await $`docker tag ${dockerTag} ${latestTag}`.pipe(process.stdout);
    await $`docker push ${latestTag}`.pipe(process.stdout);

    console.log(chalk.blue(`\n✅ Published ${latestTag} to DockerHub\n`));
  }
}

async function versionInfo() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  console.log(chalk.blue(`\n⏳ Building version-info\n`));

  const newVersionInfo = await getVersionInfo({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  const versionInfoName =
    edition === "ee" ? "version-info-ee.json" : "version-info.json";

  fs.writeFileSync(versionInfoName, JSON.stringify(newVersionInfo, null, 2));

  await $`aws s3 cp ${versionInfoName} s3://${AWS_S3_STATIC_BUCKET}/${versionInfoName}`.pipe(
    process.stdout,
  );

  if (!process.env.SKIP_CLOUDFRONT) {
    await $`aws cloudfront create-invalidation \
      --distribution-id ${AWS_CLOUDFRONT_STATIC_ID} \
      --paths /${versionInfoName}`.pipe(process.stdout);
  }

  console.log(chalk.blue(`\n✅ Published ${versionInfoName} to s3\n`));
}

async function tag() {
  // tag commit
  await $`git tag ${version} ${commit}`;
  await $`git push origin ${version}`.pipe(process.stdout);

  console.log(chalk.blue(`\n✅ Tagged ${version}\n`));
}

async function releaseNotes() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  console.log(chalk.blue(`\n⏳ Building Release Notes for ${version}\n`));

  const checksum = (await $`shasum -a 256 ${JAR_PATH}/metabase.jar`)
    .toString()
    .split(" ")[0];

  await publishRelease({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
    checksum,
  });

  console.log(
    chalk.blue(`\n✅ Published release notes for ${version} to github\n`),
  );
}

async function updateMilestones() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  await closeMilestone({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  await openNextMilestones({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });
}

/**************************************************
          MAIN CONTROL FUNCTION
 **************************************************/

(async () => {
  if (!step) {
    console.log(
      chalk.red("You must provide a step argument like --build or --publish"),
    );
  }

  if (step === "build") {
    await checkReleased();
    await build();
  }

  if (step === "publish") {
    console.log(chalk.blue(`\n🚀 Publishing ${edition} ${version}🚀\n`));

    await checkReleased();
    await s3();
    await docker();
    await versionInfo();
    await tag();
    await releaseNotes();
    await updateMilestones();

    console.log(chalk.blue(`\n✅ Published ${edition} ${version}`));

    const remainingSteps = [
      "Publish the release notes",
      "Close and create a new milestone",
      "Reorder commits to make sure OSS is first",
      "Submit a Pull request to build the docker image for cloud",
      "Create an issue to update cloud instances",
      "Update documentation on the website to reflect the newly released versions",
    ];

    console.log(
      chalk.blue(
        `\nDon't forget, you still need to:\n ✔️ ${remainingSteps.join(
          "\n ✔️ ",
        )}\n)}`,
      ),
    );
  }

  if (step === "check-jar") {
    await checkJar();
  }

  if (step === "s3") {
    await s3();
  }

  if (step === "docker") {
    await docker();
  }

  if (step === "version-info") {
    await versionInfo();
  }

  if (step === "tag") {
    await tag();
  }

  if (step === "release-notes") {
    await releaseNotes();
  }

  if (step === "update-milestones") {
    await updateMilestones();
  }
})();

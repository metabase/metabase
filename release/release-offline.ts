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

import { latest } from "immer/dist/internal";
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
  AWS_SECRET_ACCESS_KEY,
  AWS_ACCESS_KEY_ID,
  DOCKERHUB_OWNER,
  DOCKERHUB_RELEASE_USERNAME,
  DOCKERHUB_RELEASE_TOKEN,
} = process.env;

const github = new Octokit({ auth: GITHUB_TOKEN });

const JAR_PATH = "../target/uberjar";

const version = process.argv?.[2]?.trim();
const commitHash = process.argv?.[3]?.trim();
const step = process.argv?.[4]?.trim().replace("--", "");
const isWithoutGithub = process.argv?.[5]?.trim() === "--without-github";
let latestFlag: string | boolean | null = process.argv?.[6]?.trim();

const log = (message, color = "blue") =>
  // eslint-disable-next-line no-console
  console.log(chalk[color](`\n${message}\n`));

function error(message) {
  log(`⚠️   ${message}`, "red");
  process.exit(1);
}

// need to force the user to set the latest tag from the command line if they are releasing without github
if (isWithoutGithub) {
  if (!latestFlag) {
    error('If you are releasing without github you must pass --latest or --not-latest as the last argument');
  }

  latestFlag = (latestFlag === "--latest") ? true : false;
}

const edition = isEnterpriseVersion(version) ? "ee" : "oss";

if (!isValidVersionString(version)) {
  error(
    "You must provide a valid version string as the first argument (e.g v0.45.6)",
  );
}

if (!isValidCommitHash(commitHash)) {
  error("You must provide a valid commit hash as the second argument");
}

if (!step) {
  error("You must provide a step argument like --build or --publish");
}

/**************************************************
          HELPERS
 **************************************************/

// mostly for type checking
function getGithubCredentials() {
  if (isWithoutGithub) {
    return { GITHUB_TOKEN: '', GITHUB_OWNER: '', GITHUB_REPO: '' };
  }

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    error("You must provide all github environment variables in .env-template");
    process.exit(1);
  }

  return { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO };
}

function getAWSCredentials() {
  if (
    !AWS_S3_DOWNLOADS_BUCKET ||
    !AWS_S3_STATIC_BUCKET ||
    !AWS_CLOUDFRONT_STATIC_ID ||
    !AWS_CLOUDFRONT_DOWNLOADS_ID ||
    !AWS_SECRET_ACCESS_KEY ||
    !AWS_ACCESS_KEY_ID
  ) {
    error("You must provide all AWS environment variables in .env-template");
    process.exit(1);
  }

  return {
    AWS_S3_DOWNLOADS_BUCKET,
    AWS_S3_STATIC_BUCKET,
    AWS_CLOUDFRONT_DOWNLOADS_ID,
    AWS_CLOUDFRONT_STATIC_ID,
  };
}

function getDockerCredentials() {
  if (
    !DOCKERHUB_RELEASE_USERNAME ||
    !DOCKERHUB_RELEASE_TOKEN ||
    !DOCKERHUB_OWNER
  ) {
    error("You must provide all docker environment variables in .env-template");
    process.exit(1);
  }

  return {
    DOCKERHUB_RELEASE_USERNAME,
    DOCKERHUB_RELEASE_TOKEN,
    DOCKERHUB_OWNER,
  };
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

  log(versionProperties, "green");

  if (!versionProperties.includes(`tag=${version}`)) {
    error(`This jar does not match the input version: ${version}`);
  }
}

/**************************************************
          BUILD STEP
 **************************************************/
async function build() {
  log(`🚀 Building ${edition} jar for ${version} from commit ${commitHash}`);

  const unstagedChanges = (await $`git status --porcelain`).toString().trim();

  if (unstagedChanges) {
    error(
      `You have unstaged changes:\n\n ${unstagedChanges}\n\nPlease commit or stash them and try again`,
    );
  }

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

  try {
    await $`git fetch --all`;
    await $`git stash && git checkout ${commitHash}`;

    // actually build jar
    await $`../bin/build.sh :edition :${edition} :version ${version}`.pipe(
      process.stdout,
    );

    await $`git checkout -`;
    await $`echo ${commitHash} > ${JAR_PATH}/COMMIT-ID`;
    await $`shasum -a 256 ${JAR_PATH}/metabase.jar > ${JAR_PATH}/SHA256.sum`;

    log(`✅ Built ${edition} jar for ${version} in ${JAR_PATH}`, "green");
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
  log(`⏳ Publishing ${version} to s3`);

  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();
  const { AWS_S3_DOWNLOADS_BUCKET } = getAWSCredentials();

  await checkJar();

  const isLatest = isWithoutGithub ? latestFlag : await isLatestRelease({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  const versionPath = edition === "ee" ? `enterprise/${version}` : version;

  await $`aws s3 cp ${JAR_PATH}/metabase.jar s3://${AWS_S3_DOWNLOADS_BUCKET}/${versionPath}/metabase.jar`.pipe(
    process.stdout,
  );

  if (isLatest === 'true') {
    await $`aws s3 cp ${JAR_PATH}/metabase.jar s3://${AWS_S3_DOWNLOADS_BUCKET}/latest/metabase.jar`.pipe(
      process.stdout,
    );
  }

  await $`aws cloudfront create-invalidation \
    --distribution-id ${AWS_CLOUDFRONT_DOWNLOADS_ID} \
    --paths /${versionPath}/metabase.jar`.pipe(process.stdout);

  log(`✅ Published ${version} to s3`);
}

async function docker() {
  log(`⏳ Building docker image for ${version}`);

  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();
  const {
    DOCKERHUB_RELEASE_USERNAME,
    DOCKERHUB_RELEASE_TOKEN,
    DOCKERHUB_OWNER,
  } = getDockerCredentials();

  await checkJar();

  await $`cp -r ${JAR_PATH}/metabase.jar ../bin/docker/`;
  const dockerRepo = edition === "ee" ? "metabase-enterprise" : "metabase";
  const dockerTag = `${DOCKERHUB_OWNER}/${dockerRepo}:${version}`;
  await $`docker build --tag ${dockerTag} ../bin/docker/.`.pipe(process.stdout);

  log(`⏳ Pushing docker image to dockerhub for ${version}`);

  await $`docker login --username ${DOCKERHUB_RELEASE_USERNAME} -p ${DOCKERHUB_RELEASE_TOKEN}`;
  await $`docker push ${dockerTag}`.pipe(process.stdout);

  log(`✅ Published ${dockerTag} to DockerHub`);

  const isLatest = isWithoutGithub ? latestFlag :await isLatestRelease({
    github,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    version,
  });

  if (isLatest === 'true') {
    const latestTag = `${DOCKERHUB_OWNER}/${dockerRepo}:latest`;
    await $`docker tag ${dockerTag} ${latestTag}`.pipe(process.stdout);
    await $`docker push ${latestTag}`.pipe(process.stdout);

    log(`✅ Published ${latestTag} to DockerHub`);
  }
}

async function versionInfo() {
  log(`⏳ Building version-info.json`);

  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();
  const { AWS_S3_STATIC_BUCKET, AWS_CLOUDFRONT_STATIC_ID } =
    getAWSCredentials();

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

  await $`aws cloudfront create-invalidation \
    --distribution-id ${AWS_CLOUDFRONT_STATIC_ID} \
    --paths /${versionInfoName}`.pipe(process.stdout);

  log(`✅ Published ${versionInfoName} to s3`);
}

async function tag() {
  // tag commit
  await $`git tag ${version} ${commitHash}`;
  await $`git push origin ${version}`.pipe(process.stdout);

  log(`✅ Tagged ${version}`);
}

async function releaseNotes() {
  const { GITHUB_OWNER, GITHUB_REPO } = getGithubCredentials();

  log(`⏳ Building Release Notes for ${version}`);

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

  log(`✅ Published release notes for ${version} to github\n`);
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
  if (step === "build") {
    await checkReleased();
    await build();
  }

  if (step === "publish") {
    log(`🚀 Publishing ${edition} ${version} 🚀`);

    if ( isWithoutGithub ) {
      log(`⚠️   Skipping github steps because --without-github was passed   ⚠️`, "yellow");

      await s3();
      await docker();

      const remainingSteps = [
        "release notes were not published",
        "version-info.json was not updated",
        "no commit was tagged",
        "no milestones were updated",
      ].join("\n ❌  ");

      log(`Because you released without github the following steps were not completed:\n ❌  ${remainingSteps}`);

      return;
    }

    await checkReleased();
    await s3();
    await docker();
    await versionInfo();
    await tag();
    await releaseNotes();
    await updateMilestones();

    log(`✅ Published ${edition} ${version}`);

    const remainingSteps = [
      "Publish the release notes",
      "Reorder commits to make sure OSS is first",
      "Submit a pull request to build the docker image for cloud",
      "Create an issue to update cloud instances",
      "Update documentation on the website to reflect the newly released versions",
    ].join("\n ✔️  ");

    log(`Don't forget, you still need to:\n ✔️  ${remainingSteps}`);
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

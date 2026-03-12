const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const collectAndAverageTimings = async ({
  github,
  context,
  daysBack = 7,
  existingTimingsPath = "e2e/support/timings.json",
}) => {
  try {
    const artifacts = await findMergedTimingArtifacts({
      github,
      context,
      daysBack,
    });

    if (artifacts.length === 0) {
      throw new Error("No timing artifacts found in the specified time range");
    }

    const timingData = await downloadAndExtractArtifacts(
      artifacts,
      github,
      context,
    );

    if (timingData.length === 0) {
      throw new Error("No valid timing data extracted from artifacts");
    }

    const averagedTimings = averageTimings(timingData);
    averagedTimings.durations.sort((a, b) => a.spec.localeCompare(b.spec));

    fs.writeFileSync(
      existingTimingsPath,
      JSON.stringify(averagedTimings, null, 2),
    );
    console.log(`✅ Updated ${existingTimingsPath} with new timing data`);

    return { artifactCount: timingData.length };
  } catch (error) {
    console.error("❌ Error in collectAndAverageTimings:", error.message);
    throw error;
  }
};

const findMergedTimingArtifacts = async ({ github, context, daysBack }) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  console.log(
    `Searching for merged timing artifacts created after ${cutoffDate.toISOString()}`,
  );

  const artifacts = [];
  let page = 1;

  while (true) {
    try {
      const { data } = await github.rest.actions.listArtifactsForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        name: "merged-e2e-timings",
        per_page: 100,
        page,
      });

      const validArtifacts = data.artifacts
        .filter((a) => new Date(a.created_at) > cutoffDate && !a.expired)
        .map(({ name, created_at, id }) => ({ name, created_at, id }));
      artifacts.push(...validArtifacts);

      if (
        data.artifacts.some((a) => new Date(a.created_at) <= cutoffDate) ||
        data.artifacts.length < 100
      ) {
        break;
      }
      page++;
    } catch (error) {
      console.log(
        `Error fetching artifacts page ${page - 1}: ${error.message}`,
      );
      break;
    }
  }

  console.log(`Found ${artifacts.length} merged timing artifacts total`);
  return artifacts;
};

const downloadAndExtractArtifacts = async (artifacts, github, context) => {
  const tempDir = "timing-artifacts-temp";
  fs.mkdirSync(tempDir, { recursive: true });

  const timingData = [];

  for (const artifact of artifacts) {
    try {
      console.log(`Downloading artifact: ${artifact.name}`);

      const zipPath = path.join(tempDir, `${artifact.name}.zip`);
      const extractPath = path.join(tempDir, artifact.name);

      const { data } = await github.rest.actions.downloadArtifact({
        owner: context.repo.owner,
        repo: context.repo.repo,
        artifact_id: artifact.id,
        archive_format: "zip",
      });

      fs.writeFileSync(zipPath, Buffer.from(data));
      fs.mkdirSync(extractPath, { recursive: true });
      execSync(`unzip -q "${zipPath}" -d "${extractPath}"`);

      const timingFilePath = path.join(extractPath, "runTimings.json");

      if (fs.existsSync(timingFilePath)) {
        const content = JSON.parse(fs.readFileSync(timingFilePath, "utf8"));

        if (content.durations?.length) {
          timingData.push(content);
          console.log(
            `✅ Extracted timing data from ${artifact.name} (${content.durations.length} specs)`,
          );
        } else {
          console.log(`⚠ Invalid timing data structure in ${artifact.name}`);
        }
      } else {
        console.log(`⚠ No timing data found in ${artifact.name}`);
      }

      fs.rmSync(extractPath, { recursive: true });
    } catch (error) {
      console.log(`❌ Error processing ${artifact.name}: ${error.message}`);
    }
  }

  fs.rmSync(tempDir, { recursive: true });

  console.log(
    `Successfully extracted timing data from ${timingData.length}/${artifacts.length} artifacts`,
  );
  return timingData;
};

const averageTimings = (timingDataArray) => {
  if (!timingDataArray.length) {
    throw new Error("No timing data to process");
  }

  const specTimings = timingDataArray
    .flatMap((data) => data.durations)
    .filter((item) => item.spec && typeof item.duration === "number")
    .reduce((acc, { spec, duration }) => {
      (acc[spec] = acc[spec] || []).push(duration);
      return acc;
    }, {});

  const durations = Object.entries(specTimings).map(([spec, durations]) => ({
    spec,
    duration: Math.round(
      durations.reduce((sum, d) => sum + d, 0) / durations.length,
    ),
  }));

  return { durations };
};

module.exports = { collectAndAverageTimings, averageTimings };

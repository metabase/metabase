const fs = require("fs");
const path = require("path");

const collectAndAverageTimings = async ({
  github,
  context,
  token,
  branch = "master",
  daysBack = 7,
  existingTimingsPath = "e2e/support/timings.json",
}) => {
  try {
    const artifacts = await findMergedTimingArtifacts({
      github,
      context,
      branch,
      daysBack,
    });

    if (artifacts.length === 0) {
      throw new Error("No timing artifacts found in the specified time range");
    }

    const timingData = await downloadAndExtractArtifacts(artifacts, token);

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
    
    return {
      artifactCount: timingData.length
    };
  } catch (error) {
    console.error("❌ Error in collectAndAverageTimings:", error.message);
    throw error;
  }
};

const findMergedTimingArtifacts = async ({
  github,
  context,
  branch,
  daysBack,
}) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const runTestsRuns = await github.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow_id: "run-tests.yml",
    branch,
    per_page: 100,
  });

  const allRuns = runTestsRuns.data.workflow_runs.filter(
    (run) => new Date(run.created_at) > cutoffDate,
  );

  console.log(`Found ${allRuns.length} recent workflow runs to check`);

  const artifacts = [];

  for (const run of allRuns) {
    const expectedName = `merged-e2e-timings-${run.id}`;

    try {
      const runArtifacts = await github.rest.actions.listWorkflowRunArtifacts({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: run.id,
        per_page: 100,
      });

      const mergedArtifact = runArtifacts.data.artifacts.find(
        (artifact) => artifact.name === expectedName && !artifact.expired,
      );

      if (mergedArtifact) {
        artifacts.push({
          name: mergedArtifact.name,
          created_at: mergedArtifact.created_at,
          archive_download_url: mergedArtifact.archive_download_url,
        });
      }
    } catch (error) {
      console.log(`Error checking run ${run.id}: ${error.message}`);
    }
  }

  console.log(`Found ${artifacts.length} merged timing artifacts`);
  return artifacts;
};

const downloadAndExtractArtifacts = async (artifacts, token) => {
  const tempDir = "timing-artifacts-temp";
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const timingData = [];
  let successCount = 0;

  for (const artifact of artifacts) {
    try {
      console.log(`Downloading artifact: ${artifact.name}`);

      const zipPath = path.join(tempDir, `${artifact.name}.zip`);
      const extractPath = path.join(tempDir, artifact.name);

      const response = await fetch(artifact.archive_download_url, {
        headers: { Authorization: `token ${token}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(buffer));

      if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath);
      }

      const { execSync } = require("child_process");
      execSync(`unzip -q "${zipPath}" -d "${extractPath}"`);

      const timingFilePath = path.join(extractPath, "mergedTimings.json");

      if (fs.existsSync(timingFilePath)) {
        const content = fs.readFileSync(timingFilePath, "utf8");
        const data = JSON.parse(content);

        if (data.durations && Array.isArray(data.durations)) {
          timingData.push(data);
          successCount++;
          console.log(
            `✅ Extracted timing data from ${artifact.name} (${data.durations.length} specs)`,
          );
        } else {
          console.log(`⚠ Invalid timing data structure in ${artifact.name}`);
        }
      } else {
        console.log(`⚠ No timing data found in ${artifact.name}`);
      }

      fs.unlinkSync(zipPath);
      fs.rmSync(extractPath, { recursive: true });
    } catch (error) {
      console.log(`❌ Error processing ${artifact.name}: ${error.message}`);
    }
  }

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }

  console.log(
    `Successfully extracted timing data from ${successCount}/${artifacts.length} artifacts`,
  );
  return timingData;
};

const averageTimings = (timingDataArray) => {
  if (timingDataArray.length === 0) {
    throw new Error("No timing data to process");
  }

  const specTimings = {};
  timingDataArray.forEach((data) => {
    data.durations.forEach((item) => {
      if (item.spec && typeof item.duration === "number") {
        if (!specTimings[item.spec]) {
          specTimings[item.spec] = [];
        }
        specTimings[item.spec].push(item.duration);
      }
    });
  });

  const averagedTimings = { durations: [] };
  Object.entries(specTimings).forEach(([spec, durations]) => {
    const average = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    averagedTimings.durations.push({
      spec: spec,
      duration: Math.round(average),
    });
  });

  return averagedTimings;
};

module.exports = { collectAndAverageTimings };

const fs = require("fs");
const path = require("path");

const findMergedTimingArtifacts = async ({
  github,
  context,
  branch,
  daysBack,
}) => {
  console.log(
    `🔍 Searching for merged timing artifacts from ${branch} branch...`,
  );

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffDateString = cutoffDate.toISOString();

  console.log(`Looking for artifacts created after: ${cutoffDateString}`);

  // Get recent workflow runs from run-tests.yml (which calls e2e-tests.yml internally)
  const runTestsRuns = await github.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow_id: "run-tests.yml",
    branch: branch,
    per_page: 100,
  });

  // Filter runs by date and limit to most recent
  const allRuns = runTestsRuns.data.workflow_runs
    .filter((run) => new Date(run.created_at) > cutoffDate)
    .slice(0, 20); // Limit to 20 most recent runs

  console.log(`Found ${allRuns.length} recent workflow runs to check`);

  // Find artifacts in these runs
  const artifacts = [];

  for (const run of allRuns) {
    const expectedName = `merged-e2e-timings-${run.id}`;
    console.log(`Checking for artifact: ${expectedName} in run ${run.id}...`);

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
        console.log(`✅ Found artifact: ${expectedName}`);
      }
    } catch (error) {
      console.log(`⚠ Error checking run ${run.id}: ${error.message}`);
    }
  }

  console.log(`Found ${artifacts.length} merged timing artifacts`);
  return artifacts;
};

const downloadAndExtractArtifacts = async (artifacts, token) => {
  console.log("📥 Downloading and extracting timing artifacts...");

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

      // Download the artifact zip
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

      // Extract the zip
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

      // Cleanup
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
  console.log("🔄 Processing timing data to calculate averages...");

  if (timingDataArray.length === 0) {
    throw new Error("No timing data to process");
  }

  console.log(`Processing ${timingDataArray.length} timing files`);

  const specTimings = {};
  timingDataArray.forEach((data, index) => {
    data.durations.forEach((item) => {
      if (item.spec && typeof item.duration === "number") {
        if (!specTimings[item.spec]) {
          specTimings[item.spec] = [];
        }
        specTimings[item.spec].push(item.duration);
      }
    });
  });

  console.log(
    `Found timing data for ${Object.keys(specTimings).length} unique specs`,
  );

  const averagedTimings = { durations: [] };
  Object.entries(specTimings).forEach(([spec, durations]) => {
    const average = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    averagedTimings.durations.push({
      spec: spec,
      duration: Math.round(average),
    });
  });

  console.log("✅ Timing data averaged successfully");

  return averagedTimings;
};

const mergeWithExistingTimings = (existingPath, averagedTimings) => {
  console.log(`🔄 Merging with existing timings file: ${existingPath}`);

  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(existingPath, "utf8"));
  } catch (error) {
    console.log("⚠ Could not read existing timings file, creating new one");
    existing = { durations: [] };
  }

  // Create a map of averaged timings for quick lookup
  const averagedMap = new Map();
  averagedTimings.durations.forEach((item) => {
    averagedMap.set(item.spec, item.duration);
  });

  let updatedCount = 0;
  let newCount = 0;

  // Update existing timings with averaged values where available
  existing.durations.forEach((item) => {
    if (averagedMap.has(item.spec)) {
      const oldDuration = item.duration;
      item.duration = averagedMap.get(item.spec);
      console.log(
        `🔄 Updated ${item.spec}: ${oldDuration}ms → ${item.duration}ms`,
      );
      updatedCount++;
    }
  });

  // Add any new specs from averaged that aren't in existing
  averagedTimings.durations.forEach((item) => {
    if (!existing.durations.find((e) => e.spec === item.spec)) {
      existing.durations.push(item);
      console.log(`✨ Added new spec ${item.spec}: ${item.duration}ms`);
      newCount++;
    }
  });

  // Sort by spec name for consistency
  existing.durations.sort((a, b) => a.spec.localeCompare(b.spec));
  return existing;
};

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

    // Merge with existing timings file
    const mergedTimings = mergeWithExistingTimings(
      existingTimingsPath,
      averagedTimings,
    );

    // Write the merged result back to the timings file
    fs.writeFileSync(
      existingTimingsPath,
      JSON.stringify(mergedTimings, null, 2),
    );
    console.log(`✅ Updated ${existingTimingsPath} with merged timing data`);

    return mergedTimings;
  } catch (error) {
    console.error("❌ Error in collectAndAverageTimings:", error.message);
    throw error;
  }
};

module.exports = { collectAndAverageTimings };

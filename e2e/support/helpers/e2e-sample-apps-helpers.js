function convertStringListToArray(stringList) {
  return (stringList ?? "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export function getSampleAppsNamesFromEnv() {
  const sampleAppNames = convertStringListToArray(process.env.SAMPLE_APP_NAMES);
  const excludeSampleAppNames = convertStringListToArray(
    process.env.EXCLUDE_SAMPLE_APP_NAMES,
  );

  return sampleAppNames.filter(
    sampleAppName => !excludeSampleAppNames.includes(sampleAppName),
  );
}

export function getSampleAppsEmbeddingSdkSpecFiles(basePath) {
  let sampleAppsMatch = "**";

  const sampleAppNames = getSampleAppsNamesFromEnv();

  if (sampleAppNames.length) {
    if (sampleAppNames.length === 1) {
      sampleAppsMatch = sampleAppNames;
    } else {
      sampleAppsMatch = `{${sampleAppNames.join(",")}}`;
    }
  }

  return `${basePath}/${sampleAppsMatch}/*.cy.spec.ts`;
}

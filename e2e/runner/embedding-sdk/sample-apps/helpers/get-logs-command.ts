export const getLogsCommand = (appName: string): string => {
  if (!/^[a-zA-Z0-9-]+$/.test(appName)) {
    throw new Error(
      `Invalid appName: "${appName}". Only alphanumeric characters and hyphens are allowed.`,
    );
  }

  return `for container in $(docker ps --filter "name=${appName}-" --format "{{.Names}}"); do docker logs "$container" 2>&1 | sed "s/^/[$container] /"; done`;
};

export const getLogsCommand = (appName: string): string => {
  if (!/^[a-zA-Z0-9-]+$/.test(appName)) {
    throw new Error(
      `Invalid appName: "${appName}". Only alphanumeric characters and hyphens are allowed.`,
    );
  }

  // `-a`, because the only time these logs are wanted is when a container failed -- and a container that died on
  // startup is no longer running, so plain `docker ps` matches nothing and this prints an empty string. That is the
  // difference between "the metabase container exited (1)" and knowing why.
  return `for container in $(docker ps -a --filter "name=${appName}-" --format "{{.Names}}"); do docker logs "$container" 2>&1 | sed "s/^/[$container] /"; done`;
};

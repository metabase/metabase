export const getLogsCommand = (appName: string): string =>
  `for container in $(docker ps --filter "name=${appName}-" --format "{{.Names}}"); do docker logs "$container" 2>&1 | sed "s/^/[$container] /"; done`;

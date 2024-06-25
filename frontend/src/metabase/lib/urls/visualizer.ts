export function visualizer(setupDefinition?: string) {
  if (setupDefinition) {
    return `v/${setupDefinition}`;
  } else {
    return `v`;
  }
}

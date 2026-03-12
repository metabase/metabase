/**
 * IMPORTANT!
 * Any rename/removal change for fields is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export type BuildInfo = {
  version?: string;
  gitBranch?: string;
  gitCommitSha?: string;
  buildTime?: string;
};

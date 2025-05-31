export const BUNDLED_PACKAGES = [
  "classnames",

  // We have to bundle to force the proper logic based on the `NODE_ENV: "production"`
  "icepick",

  // Have patches on our side
  "@mantine/core",
  "echarts",

  // We have a build-time plugin that fixes imports for it
  "react-virtualized",

  // Because we bundle @mantine/core we have to be sure that the same version of dates/hooks libraries is installed
  "@mantine/dates",
  "@mantine/hooks",

  // Has errors during rollup treeshaking
  "iframe-resizer",

  // these I want recheck
  "crc-32",
  "ttag",
];

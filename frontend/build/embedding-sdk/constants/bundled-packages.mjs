export const BUNDLED_PACKAGES = [
  // We have to bundle to force the proper logic based on the `NODE_ENV: "production"`
  "icepick",

  // Have patches on our side
  "@mantine/core",
  "echarts",

  // Because we bundle @mantine/core we have to be sure that the same version of dates/hooks libraries is installed
  "@mantine/dates",
  "@mantine/hooks",

  // Used also in CLJS code. There are runtime errors if defined as externals
  "crc-32",
  "ttag",
];

export default function testAcrossTimezones(runTests) {
  // run_timezone_tests sets "TZ" environment variable to change the timezone
  const clientTz = process.env["TZ"] || "[default]";
  // run_timezone_tests also sets "METABASE_TEST_TIMEZONES" to list of timezones
  const reportTzs = (process.env["METABASE_TEST_TIMEZONES"] || "Etc/UTC").split(
    " ",
  );

  describe(`client timezone ${clientTz}`, () => {
    reportTzs.map(reportTz => {
      describe(`report timezone ${reportTz}`, () => {
        runTests(reportTz);
      });
    });
  });
}

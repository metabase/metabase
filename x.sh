#! /usr/bin/env bash

set -euxo pipefail

clj -X:dev:test :only '[
metabase.pulse.pulse-integration-test/consistent-date-formatting-test
metabase.pulse.pulse-integration-test/apply-formatting-in-csv-no-dashboard-test
metabase.pulse.pulse-integration-test/simple-model-with-metadata-no-dashboard-in-html-static-viz-test
metabase.pulse.pulse-integration-test/result-metadata-preservation-in-html-static-viz-for-dashboard-test

]'

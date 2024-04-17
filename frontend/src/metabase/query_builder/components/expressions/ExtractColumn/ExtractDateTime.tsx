import { useState, useMemo } from "react";
import { t } from "ttag";
import { Stack } from "metabase/ui";

import { Button } from "./Button";

export function ExtractDateTime({}: {}) {
  return (
    <Stack spacing={0}>
      <Button title={t`Hour of the day`} example="0, 1" />
      <Button title={t`Day of week`} example="Monday, Tuesday" />
      <Button title={t`Month of month`} example="1, 2" />
      <Button title={t`Month of year`} example="Jan, Feb" />
      <Button title={t`Quarter of year`} example="Q1, Q2" />
      <Button title={t`Year`} example="2023, 2024" />
    </Stack>
  );
}

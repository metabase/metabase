import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { c, t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  NumberInput,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import type { FindSlowToolProps } from "metabase/plugins/oss/transform-optimizer";

import { useBulkOptimizeMutation } from "../../api";
import { BulkResultsDrawer } from "../BulkResultsDrawer";

const POPOVER_MIN_WIDTH = 320;

export function FindSlowTool({
  thresholdSec,
  onThresholdChange,
  matchingTransformIds,
}: FindSlowToolProps) {
  const [isOpened, { toggle, close }] = useDisclosure();
  const [isDrawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure();
  const [bulkOptimize, { isLoading }] = useBulkOptimizeMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [draftSec, setDraftSec] = useState<number | "">(thresholdSec ?? "");

  const handleApply = (event: FormEvent) => {
    event.preventDefault();
    const next = typeof draftSec === "number" && draftSec > 0 ? draftSec : undefined;
    onThresholdChange(next);
  };

  const handleClear = () => {
    setDraftSec("");
    onThresholdChange(undefined);
    close();
  };

  const handleHammerTime = async () => {
    if (matchingTransformIds.length === 0) {
      return;
    }
    const { data, error } = await bulkOptimize({
      transformIds: matchingTransformIds,
    });
    if (error || !data) {
      sendErrorToast(t`Failed to start bulk optimize`);
      return;
    }
    close();
    // The drawer polls /bulk-optimize/status from here — rows appear as
    // each transform's analysis finishes; users can click through to
    // verify / accept on the detail page (proposals are server-cached).
    openDrawer();
  };

  const matchCount = matchingTransformIds.length;
  const hasThreshold = thresholdSec != null;

  return (
    <>
    <Popover opened={isOpened} position="bottom-end" onDismiss={close}>
      <Popover.Target>
        <Button
          variant={hasThreshold ? "filled" : "default"}
          leftSection={<Icon name="clock" />}
          onClick={toggle}
        >
          {hasThreshold
            ? t`Slow: ≥ ${thresholdSec}s (${matchCount})`
            : t`Find slow`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Box component="form" miw={POPOVER_MIN_WIDTH} onSubmit={handleApply}>
          <Stack p="md" gap="sm">
            <Text fw="bold">{t`Find slow transforms`}</Text>
            <Text c="text-secondary" fz="sm">
              {t`Filter the list to transforms whose last successful run took at least this long.`}
            </Text>
            <NumberInput
              label={t`Threshold (seconds)`}
              placeholder="60"
              value={draftSec}
              min={1}
              step={1}
              allowDecimal={false}
              allowNegative={false}
              autoFocus
              onChange={(v) => setDraftSec(typeof v === "number" ? v : "")}
            />
            {hasThreshold && (
              <Text c="text-secondary" fz="sm">
                {matchCount === 0
                  ? t`No transforms match the current threshold.`
                  : c("Match count under the slow-transforms filter")
                      .t`${matchCount} matching transform(s)`}
              </Text>
            )}
          </Stack>
          <Divider />
          <Group p="md" justify="space-between">
            <Button
              variant="subtle"
              disabled={!hasThreshold && draftSec === ""}
              onClick={handleClear}
            >
              {t`Clear`}
            </Button>
            <Group gap="sm">
              <Button
                type="submit"
                variant={hasThreshold ? "default" : "filled"}
                disabled={draftSec === "" || draftSec === thresholdSec}
              >
                {hasThreshold ? t`Update filter` : t`Apply filter`}
              </Button>
              <Button
                color="warning"
                variant="filled"
                leftSection={<Icon name="bolt" />}
                disabled={!hasThreshold || matchCount === 0 || isLoading}
                loading={isLoading}
                onClick={handleHammerTime}
              >
                {t`Hammer time`}
              </Button>
            </Group>
          </Group>
        </Box>
      </Popover.Dropdown>
    </Popover>
    <BulkResultsDrawer opened={isDrawerOpened} onClose={closeDrawer} />
    </>
  );
}

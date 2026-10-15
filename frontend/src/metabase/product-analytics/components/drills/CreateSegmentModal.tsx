import { useState } from "react";
import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import type { CommonSettings } from "../../analyses/types";
import { parseDateRange } from "../../date-range";
import type { ChartDrill } from "../../drills/types";
import type { DrillQueries } from "../../drills/use-drill-queries";
import type { CohortFilter } from "../../filters";
import { FilterPills, getCountLabel } from "../FilterPills";

type CreateSegmentModalProps = {
  drill: ChartDrill;
  settings: CommonSettings;
  table: Table | undefined;
  queries: DrillQueries;
  toCohort: (drill: ChartDrill) => Promise<CohortFilter>;
  onClose: () => void;
};

export const CreateSegmentModal = ({
  drill,
  settings,
  table,
  queries,
  toCohort,
  onClose,
}: CreateSegmentModalProps) => {
  const [sendToast] = useToast();
  const [createSegment] = useCreateSegmentMutation();
  const [name, setName] = useState(drill.label);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetTable = queries.target?.table;

  const dateRange = parseDateRange(settings.date_range);
  const filters = {
    ...settings.filters,
    cohorts: [
      ...settings.filters.cohorts,
      { label: drill.label, grain: queries.grain, ids: [] },
    ],
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const cohort = await toCohort(drill);
      const segment = await createSegment({
        name: name.trim(),
        description: description.trim() || undefined,
        definition: Lib.toJsQuery(queries.buildCohortQuery(cohort)),
      }).unwrap();
      const count = getCountLabel(queries.grain, cohort.ids.length);
      sendToast({
        icon: "segment",
        message: t`Saved “${segment.name}”, with ${count}`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : getErrorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <Modal opened title={t`Create a segment`} size="lg" onClose={onClose}>
      <Stack gap="lg" pt="sm">
        <TextInput
          label={t`Name`}
          value={name}
          data-autofocus
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Textarea
          label={t`Description`}
          placeholder={t`What makes this group interesting?`}
          value={description}
          autosize
          minRows={2}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <Stack gap="sm">
          <Text fw="bold">{t`Filters`}</Text>
          <FilterPills
            value={filters}
            table={table}
            extraLabels={
              dateRange !== undefined
                ? [getDateFilterDisplayName(dateRange)]
                : []
            }
          />
          {targetTable && (
            <Text c="text-secondary" fz="sm">
              {t`This segment will be saved on the ${targetTable.display_name} table.`}
            </Text>
          )}
        </Stack>
        {error !== null && <Alert color="error">{error}</Alert>}
        <Group justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            loading={isSaving}
            disabled={name.trim() === "" || targetTable === undefined}
            onClick={handleSave}
          >
            {t`Save`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

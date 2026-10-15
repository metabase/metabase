import { useState } from "react";
import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useMetadataProvider } from "metabase/metadata-store";
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Segment, Table } from "metabase-types/api";

import { readEventQuery } from "../../events/read-event-query";
import type { SegmentDraft } from "../../segments/types";
import { ConditionsEditor } from "../events/ConditionsEditor";

const STAGE_INDEX = -1;

type NewSegmentModalProps = {
  table: Table;
  tableQuery: Lib.Query;
  /** Starts from a draft's name and conditions. */
  draft?: SegmentDraft;
  onClose: () => void;
  onCreated: (segment: Segment) => void;
};

/** Creates a segment on the table from a name, a description and conditions. */
export const NewSegmentModal = ({
  table,
  tableQuery,
  draft,
  onClose,
  onCreated,
}: NewSegmentModalProps) => {
  const [createSegment, { isLoading }] = useCreateSegmentMutation();
  const [sendToast] = useToast();
  const metadataProvider = useMetadataProvider(Lib.databaseID(tableQuery));
  const [query, setQuery] = useState(
    () => (draft && readEventQuery(metadataProvider, draft)) ?? tableQuery,
  );
  const [name, setName] = useState(draft?.name ?? "");
  const [description, setDescription] = useState("");
  const filters = Lib.filters(query, STAGE_INDEX);
  const canSubmit = name.trim() !== "" && filters.length > 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    try {
      const segment = await createSegment({
        name: name.trim(),
        description: description.trim() || undefined,
        definition: Lib.toJsQuery(query),
      }).unwrap();
      onCreated(segment);
    } catch (error) {
      sendToast({
        icon: "warning",
        message: getErrorMessage(error, t`Couldn't create the segment`),
      });
    }
  };

  return (
    <Modal
      opened
      size="lg"
      title={t`New segment on ${table.display_name}`}
      onClose={onClose}
    >
      <Stack gap="lg" pt="sm">
        <Stack gap="xs">
          <Text fw="bold">{t`Conditions`}</Text>
          <ConditionsEditor
            query={query}
            onChange={setQuery}
            initialOpened={filters.length === 0}
          />
        </Stack>
        <TextInput
          label={t`Name`}
          placeholder={t`Something descriptive but not too long`}
          value={name}
          data-autofocus
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Textarea
          label={t`Description`}
          placeholder={t`Optional. Explain the less obvious rules.`}
          value={description}
          minRows={2}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <Group justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={!canSubmit}
            loading={isLoading}
            onClick={handleSubmit}
          >
            {t`Create segment`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

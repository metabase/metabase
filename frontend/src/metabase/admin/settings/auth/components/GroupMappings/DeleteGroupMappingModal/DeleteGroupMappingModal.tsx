import { useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Modal, Radio, Stack, Text } from "metabase/ui";

import S from "../GroupMappings.module.css";
import type { DeleteMappingModalValueType } from "../types";

export type DeleteGroupMappingModalProps = {
  mappingName: string;
  clearedGroups: string[];
  keptOnClear: string[];
  deletedGroups: string[];
  keptOnDelete: string[];
  // an extra consequence the caller wants spelled out, shown under the lead text
  note?: string;
  onConfirm: (value: DeleteMappingModalValueType) => void;
  onHide: () => void;
};

function getKeptNote(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return t`The ${names[0]} group is not affected.`;
  }
  return t`These groups are not affected: ${names.join(", ")}.`;
}

export const DeleteGroupMappingModal = ({
  mappingName,
  clearedGroups,
  keptOnClear,
  deletedGroups,
  keptOnDelete,
  note,
  onConfirm,
  onHide,
}: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState<DeleteMappingModalValueType>("nothing");
  const applicationName = useSelector(getApplicationName);
  const groupCount = clearedGroups.length + keptOnClear.length;
  const isPlural = groupCount > 1;
  const canCascade = clearedGroups.length > 0 || deletedGroups.length > 0;
  const keptOnClearNote = getKeptNote(keptOnClear);
  const keptOnDeleteNote = getKeptNote(keptOnDelete);
  const hasDeleteDescription =
    deletedGroups.length > 0 || keptOnDeleteNote != null;

  const handleChange = (newValue: DeleteMappingModalValueType) => {
    setValue(newValue);
  };

  const handleConfirm = () => {
    onConfirm(value);
  };

  const submitButtonLabels: Record<DeleteMappingModalValueType, string> = {
    nothing: t`Remove mapping`,
    clear: t`Remove mapping and members`,
    delete:
      deletedGroups.length > 1
        ? t`Remove mapping and delete groups`
        : t`Remove mapping and delete group`,
  };

  let lead: string;
  if (groupCount === 0) {
    lead = t`This mapping isn't linked to any group.`;
  } else if (isPlural) {
    lead = t`Membership of these groups will no longer be synced when users log in.`;
  } else {
    lead = t`Membership of this group will no longer be synced when users log in.`;
  }

  return (
    <Modal opened onClose={onHide} title={t`Remove this group mapping?`}>
      <Stack gap="xl">
        <Box>
          <Text fw="bold" className={S.wrappableText}>
            {mappingName}
          </Text>
          <Text>{lead}</Text>
        </Box>
        {note && <Text>{note}</Text>}
        {!canCascade && keptOnDeleteNote && <Text>{keptOnDeleteNote}</Text>}

        {canCascade && (
          <Box>
            <Text mb="lg">
              {isPlural
                ? t`What should happen with the groups themselves in ${applicationName}?`
                : t`What should happen with the group itself in ${applicationName}?`}
            </Text>
            <Radio.Group
              value={value}
              onChange={(newValue) =>
                // Unjustified type cast. FIXME
                handleChange(newValue as DeleteMappingModalValueType)
              }
            >
              <Stack gap="sm">
                <Radio
                  value="nothing"
                  label={t`Nothing, just remove the mapping`}
                />
                <Radio
                  value="clear"
                  disabled={clearedGroups.length === 0}
                  label={
                    clearedGroups.length > 1
                      ? t`Also remove all members from these groups`
                      : t`Also remove all members from this group`
                  }
                  description={
                    <>
                      {clearedGroups.length > 0 && (
                        <Box component="span" display="block">
                          {clearedGroups.join(", ")}
                        </Box>
                      )}
                      {t`Members keep their ${applicationName} accounts.`}{" "}
                      {keptOnClearNote}
                    </>
                  }
                />
                <Radio
                  value="delete"
                  disabled={deletedGroups.length === 0}
                  label={
                    deletedGroups.length > 1
                      ? t`Also delete the groups`
                      : t`Also delete the group`
                  }
                  description={
                    hasDeleteDescription && (
                      <>
                        {deletedGroups.length > 0 && (
                          <Box component="span" display="block">
                            {deletedGroups.join(", ")}
                          </Box>
                        )}
                        {keptOnDeleteNote}
                      </>
                    )
                  }
                />
              </Stack>
            </Radio.Group>
          </Box>
        )}
      </Stack>
      <Modal.Footer>
        <Button onClick={onHide}>{t`Cancel`}</Button>
        <Button variant="filled" color="negative" onClick={handleConfirm}>
          {submitButtonLabels[value]}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

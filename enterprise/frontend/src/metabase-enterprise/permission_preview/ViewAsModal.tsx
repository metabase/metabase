import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

import { PrincipalPicker } from "./PrincipalPicker";
import {
  type Principal,
  type PrincipalType,
  useGetAffectingAttributesQuery,
  useStartPreviewMutation,
} from "./api";
import { getPreviewUrl } from "./preview-state";
import { AttributeBar, getRuleAttributes } from "./troubleshoot/AttributeBar";
import { useUnsavedEdits } from "./unsaved-edits";

type ViewAsModalProps = {
  opened: boolean;
  onClose: () => void;
  path: string;
  entityName?: string;
};

/**
 * Picks a user or group, then switches this tab to `path` with the whole app running,
 * read-only, as that principal. A group whose access depends on user attributes also asks for
 * their values.
 */
export function ViewAsModal({
  opened,
  onClose,
  path,
  entityName,
}: ViewAsModalProps) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [pickedValues, setPickedValues] = useState<Record<string, string>>({});
  const [startPreview, { error, isLoading }] = useStartPreviewMutation();
  const pickedPrincipal =
    principal != null && principal.id > 0 ? principal : null;
  const { data: attributes = [], isFetching: isLoadingAttributes } =
    useGetAffectingAttributesQuery(
      pickedPrincipal?.type === "group"
        ? { principal: pickedPrincipal }
        : skipToken,
    );
  const { edits, unsavedEditsId } = useUnsavedEdits();
  const hasEdits = edits.length > 0;
  const isReady =
    pickedPrincipal != null &&
    !isLoadingAttributes &&
    (!hasEdits || unsavedEditsId != null);

  const handlePrincipalChange = (newPrincipal: Principal | null) => {
    setPrincipal(newPrincipal);
    setPickedValues({});
  };

  const handlePick = (attribute: string, value: string) => {
    setPickedValues((values) => ({ ...values, [attribute]: value }));
  };

  const handleOpen = async () => {
    if (!isReady) {
      return;
    }
    // like Troubleshoot, only the picked values go: the backend fills in the rest as the chips show them
    const result = await startPreview({
      ...pickedPrincipal,
      attributes: pickedValues,
      unsavedEditsId,
    });
    if (result.data) {
      const url = getPreviewUrl(path, {
        userId: result.data.user_id,
        userName: result.data.user_name,
        principalType: pickedPrincipal.type,
        principalId: pickedPrincipal.id,
        principalName: result.data.principal_name,
        attributes: result.data.attributes,
        returnPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        previewId: result.data.preview_id,
        unsavedEdits:
          unsavedEditsId != null
            ? { id: unsavedEditsId, isApplied: true }
            : undefined,
      });
      if (unsavedEditsId != null) {
        // a new tab, so this one keeps the unsaved edits; the preview tab closes on exit
        window.open(url, "_blank");
        onClose();
      } else {
        // a full load, so nothing fetched as the admin stays cached in the preview
        window.location.assign(url);
      }
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={getTitle(entityName)}
      size="lg"
    >
      <Stack gap="lg">
        <Text c="text-secondary">
          {hasEdits
            ? `${t`Opens a read-only preview in a new tab.`} ${getEditsSentence(edits.length)}`
            : t`Opens a read-only preview in this tab.`}
        </Text>
        <PrincipalPicker value={principal} onChange={handlePrincipalChange} />
        {pickedPrincipal?.type === "group" &&
          getRuleAttributes(attributes).length > 0 && (
            <Stack gap="xs">
              <Text c="text-secondary" size="sm">
                {getAttributesHint(pickedPrincipal.type)}
              </Text>
              <AttributeBar
                key={`${pickedPrincipal.type}-${pickedPrincipal.id}`}
                attributes={attributes}
                isLoading={isLoadingAttributes}
                pickedValues={pickedValues}
                onPick={handlePick}
              />
            </Stack>
          )}
        {error != null && (
          <Text c="feedback-negative">{getErrorMessage(error)}</Text>
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={!isReady}
            loading={isLoading}
            onClick={handleOpen}
          >
            {t`View app`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function getTitle(entityName?: string) {
  return entityName ? t`View “${entityName}” as…` : t`View app as…`;
}

function getEditsSentence(count: number) {
  return ngettext(
    msgid`Includes your ${count} unsaved change.`,
    `Includes your ${count} unsaved changes.`,
    count,
  );
}

function getAttributesHint(type: Exclude<PrincipalType, "user">) {
  switch (type) {
    case "group":
      return t`Pick the user attribute values to preview this group with.`;
  }
}

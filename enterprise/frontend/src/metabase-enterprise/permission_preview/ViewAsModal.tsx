import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Box, Button, Group, Modal, Stack, Text } from "metabase/ui";

import {
  AttributeValueSelect,
  getAttributeValues,
} from "./AttributeValueSelect";
import { PrincipalPicker } from "./PrincipalPicker";
import {
  type PreviewAttribute,
  type Principal,
  type StartPreviewRequest,
  useGetPreviewAttributesQuery,
  useStartPreviewMutation,
} from "./api";
import { getPreviewUrl } from "./preview-state";

type ViewAsModalProps = {
  opened: boolean;
  onClose: () => void;
  path: string;
  entityName?: string;
  /** Hands the pick back instead of switching this tab: "Preview as…" opens it in a frame. */
  onPick?: (request: StartPreviewRequest) => void;
};

/**
 * Picks a user, group or tenant, then switches this tab to `path` with the whole app running,
 * read-only, as that principal. A group whose access depends on user attributes also asks for
 * their values.
 */
export function ViewAsModal({
  opened,
  onClose,
  path,
  entityName,
  onPick,
}: ViewAsModalProps) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [pickedValues, setPickedValues] = useState<Record<string, string>>({});
  const [startPreview, { error, isLoading }] = useStartPreviewMutation();
  const groupId =
    principal?.type === "group" && principal.id > 0 ? principal.id : null;
  const { data: attributes = [], isFetching: isLoadingAttributes } =
    useGetPreviewAttributesQuery(groupId ?? skipToken);
  const shownAttributes = groupId != null ? attributes : [];
  const isReady = principal != null && principal.id > 0 && !isLoadingAttributes;

  const handlePrincipalChange = (newPrincipal: Principal | null) => {
    setPrincipal(newPrincipal);
    setPickedValues({});
  };

  const handleOpen = async () => {
    if (!isReady) {
      return;
    }
    if (onPick) {
      onPick({
        ...principal,
        attributes: getAttributeValues(shownAttributes, pickedValues),
      });
      return;
    }
    const result = await startPreview({
      ...principal,
      attributes: getAttributeValues(shownAttributes, pickedValues),
    });
    if (result.data) {
      // a full load, so nothing fetched as the admin stays cached in the preview
      window.location.assign(
        getPreviewUrl(path, {
          userId: result.data.user_id,
          userName: result.data.user_name,
          principalType: principal.type,
          principalId: principal.id,
          principalName: result.data.principal_name,
          attributes: result.data.attributes,
          returnPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          previewId: result.data.preview_id,
        }),
      );
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={getTitle({ entityName, isPreview: onPick != null })}
      size="lg"
    >
      <Stack gap="lg">
        <Text c="text-secondary">
          {onPick
            ? t`Opens the collections, dashboards and questions this user, group or tenant sees, read-only, in a sealed frame.`
            : t`Switches this tab to the app as this user, group or tenant, read-only, until you exit the preview.`}
        </Text>
        <PrincipalPicker value={principal} onChange={handlePrincipalChange} />
        {shownAttributes.length > 0 && (
          <AttributeRows
            attributes={shownAttributes}
            values={getAttributeValues(shownAttributes, pickedValues)}
            onChange={(attribute, value) =>
              setPickedValues((values) => ({ ...values, [attribute]: value }))
            }
          />
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
            {onPick ? t`Preview` : t`View app`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function getTitle({
  entityName,
  isPreview,
}: {
  entityName?: string;
  isPreview: boolean;
}) {
  if (isPreview) {
    return t`Preview as…`;
  }
  return entityName ? t`View “${entityName}” as…` : t`View app as…`;
}

type AttributeRowsProps = {
  attributes: PreviewAttribute[];
  values: Record<string, string>;
  onChange: (attribute: string, value: string) => void;
};

function AttributeRows({ attributes, values, onChange }: AttributeRowsProps) {
  return (
    <Stack gap="sm">
      <Text fw="bold">{t`This group's access depends on user attributes`}</Text>
      <Text c="text-secondary" size="sm">
        {t`A group has no attributes of its own, so pick the values to preview with.`}
      </Text>
      {attributes.map((attribute) => (
        <Group key={attribute.attribute} gap="md" wrap="nowrap">
          <Box flex={1}>
            <Text fw="bold">{attribute.attribute}</Text>
            <Text c="text-secondary" size="sm">
              {attribute.uses.join(", ")}
            </Text>
          </Box>
          <Box w="16rem">
            <AttributeValueSelect
              attribute={attribute}
              value={values[attribute.attribute] ?? ""}
              onChange={(value) => onChange(attribute.attribute, value)}
            />
          </Box>
        </Group>
      ))}
    </Stack>
  );
}

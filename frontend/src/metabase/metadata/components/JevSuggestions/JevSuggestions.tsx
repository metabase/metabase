import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  type DataSensitivityClass,
  type JevFieldSuggestion,
  useGetTableSuggestionsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { getSemanticTypeName } from "metabase/common/utils/fields";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { TableId } from "metabase-types/api";

import S from "./JevSuggestions.module.css";

interface JevSuggestionsProps {
  tableId: TableId;
}

/** Jev proposes a semantic-type change different from what the field already has. */
function hasSemanticChange(suggestion: JevFieldSuggestion): boolean {
  return (
    suggestion.suggested != null && suggestion.suggested !== suggestion.current
  );
}

/** Jev flagged a non-PUBLIC sensitivity class the field isn't already labeled with. */
function hasSensitivityChange(suggestion: JevFieldSuggestion): boolean {
  const suggested = suggestion.sensitivity?.suggested ?? null;
  return suggested != null && suggested !== suggestion.current_sensitivity;
}

/** A field is worth surfacing when Jev proposes a change to either attribute. */
function isActionable(suggestion: JevFieldSuggestion): boolean {
  return hasSemanticChange(suggestion) || hasSensitivityChange(suggestion);
}

type BadgeColor = "negative" | "warning" | "brand" | "neutral";

/** Short label + severity color for each sensitivity class. PUBLIC is intentionally omitted. */
const SENSITIVITY_META: Record<
  Exclude<DataSensitivityClass, "PUBLIC">,
  { label: string; color: BadgeColor }
> = {
  SEC_KEY: { label: "Secret", color: "negative" },
  PHI: { label: "PHI", color: "negative" },
  BIO_GEN: { label: "Biometric", color: "negative" },
  PCI_FIN: { label: "Financial", color: "negative" },
  SENS_PERS: { label: "Sensitive", color: "warning" },
  PII: { label: "PII", color: "warning" },
  SYS_TELEMETRY: { label: "Telemetry", color: "neutral" },
  CORP_IP: { label: "IP", color: "warning" },
  BIZ_CONF: { label: "Confidential", color: "warning" },
};

function sensitivityMeta(sensitivityClass: DataSensitivityClass | null) {
  if (sensitivityClass == null || sensitivityClass === "PUBLIC") {
    return null;
  }
  return SENSITIVITY_META[sensitivityClass];
}

interface SensitivityBadgeProps {
  sensitivityClass: DataSensitivityClass | null;
  confidence: number | null;
}

const SensitivityBadge = ({
  sensitivityClass,
  confidence,
}: SensitivityBadgeProps) => {
  const meta = sensitivityMeta(sensitivityClass);

  if (!meta) {
    return null;
  }

  const confidencePercent = Math.round((confidence ?? 0) * 100);

  return (
    <Tooltip
      label={t`Jev is ${confidencePercent}% confident this is ${meta.label} data`}
    >
      <Badge color={meta.color} variant="light" size="sm">
        {meta.label}
      </Badge>
    </Tooltip>
  );
};

const INLINE_PREVIEW_COUNT = 3;

export const JevSuggestions = ({ tableId }: JevSuggestionsProps) => {
  const [modalOpened, setModalOpened] = useState(false);
  const { data, isFetching, error } = useGetTableSuggestionsQuery(tableId);

  const fields = data?.fields ?? [];
  const actionable = useMemo(() => fields.filter(isActionable), [fields]);
  const sensitiveCount = useMemo(
    () =>
      fields.filter((field) =>
        sensitivityMeta(field.sensitivity?.class ?? null),
      ).length,
    [fields],
  );

  if (data && !data.jev_available) {
    return null;
  }

  if (isFetching) {
    return (
      <Group className={S.banner} gap="sm" p="md">
        <Loader size="sm" />
        <Text c="text-secondary">{t`Jev is reviewing every field…`}</Text>
      </Group>
    );
  }

  if (error != null || fields.length === 0) {
    return null;
  }

  const reviewedLabel = t`Jev reviewed ${fields.length} fields`;

  return (
    <>
      <Stack className={S.banner} gap="sm" p="md">
        <Group gap="sm" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" miw={0}>
            <Icon name="sparkles" c="brand" />
            <Text fw="bold" truncate>
              {actionable.length > 0
                ? t`Jev suggests ${actionable.length} changes`
                : reviewedLabel}
            </Text>
          </Group>
          <Anchor
            size="sm"
            onClick={() => setModalOpened(true)}
          >{t`See all ${fields.length} fields`}</Anchor>
        </Group>

        {data?.usage && (
          <Text c="text-secondary" size="sm">
            {t`${data.usage.input_tokens} input + ${data.usage.output_tokens} output tokens`}
            {" · "}
            {t`${data.call_count ?? 0} calls`}
            {" · "}
            {t`${Math.round(data.elapsed_ms ?? 0)} ms`}
            {(data.unreported_calls ?? 0) > 0 &&
              t` · Usage unavailable for ${data.unreported_calls} calls`}
          </Text>
        )}

        {sensitiveCount > 0 && (
          <Group gap="xs" wrap="nowrap">
            <Icon name="lock" c="text-secondary" size={14} />
            <Text c="text-secondary" size="sm">
              {t`${sensitiveCount} fields flagged as sensitive`}
            </Text>
          </Group>
        )}

        {actionable.slice(0, INLINE_PREVIEW_COUNT).map((suggestion) => (
          <SuggestionRow key={suggestion.field_id} suggestion={suggestion} />
        ))}

        {actionable.length > INLINE_PREVIEW_COUNT && (
          <Anchor size="sm" onClick={() => setModalOpened(true)}>
            {t`+ ${actionable.length - INLINE_PREVIEW_COUNT} more suggestions`}
          </Anchor>
        )}
      </Stack>

      <JevSuggestionsModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        fields={fields}
      />
    </>
  );
};

interface JevSuggestionsModalProps {
  opened: boolean;
  onClose: () => void;
  fields: JevFieldSuggestion[];
}

const JevSuggestionsModal = ({
  opened,
  onClose,
  fields,
}: JevSuggestionsModalProps) => {
  const changes = fields.filter(isActionable);
  const unchanged = fields.filter((field) => !isActionable(field));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Jev's field review`}
      size="lg"
    >
      <Stack className={S.modalList} gap="lg">
        {changes.length > 0 && (
          <Stack gap="sm">
            <Text fw="bold" c="text-secondary" size="sm" tt="uppercase">
              {t`Suggested changes`}
            </Text>
            {changes.map((suggestion, index) => (
              <Box key={suggestion.field_id}>
                {index > 0 && <Divider mb="sm" />}
                <SuggestionRow suggestion={suggestion} />
              </Box>
            ))}
          </Stack>
        )}

        {unchanged.length > 0 && (
          <Stack gap="sm">
            <Text fw="bold" c="text-secondary" size="sm" tt="uppercase">
              {t`No change suggested`}
            </Text>
            {unchanged.map((suggestion) => (
              <ReadOnlyRow key={suggestion.field_id} suggestion={suggestion} />
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};

interface RowProps {
  suggestion: JevFieldSuggestion;
}

interface AcceptChipProps {
  label: string;
  confidence: number | null;
  isLoading: boolean;
  isSuccess: boolean;
  onAccept: () => void;
}

/** A confidence-tinted "accept" chip: its background strength scales with Jev's confidence. */
const AcceptChip = ({
  label,
  confidence,
  isLoading,
  isSuccess,
  onAccept,
}: AcceptChipProps) => {
  const confidenceValue = confidence ?? 0;
  const confidencePercent = Math.round(confidenceValue * 100);

  if (isSuccess) {
    return (
      <Badge
        color="positive"
        variant="light"
        leftSection={<Icon name="check" size={12} />}
      >
        {label}
      </Badge>
    );
  }

  return (
    <Tooltip label={t`Jev is ${confidencePercent}% confident`}>
      <Button
        className={S.acceptButton}
        // Confidence drives the fill opacity of the button's background layer.
        style={{ "--confidence": confidenceValue } as React.CSSProperties}
        size="xs"
        variant="subtle"
        loading={isLoading}
        onClick={onAccept}
      >
        <Group gap="xs" wrap="nowrap">
          <Icon name="check" size={12} />
          <Text size="sm">{label}</Text>
          <Text size="sm" c="text-secondary">
            {confidencePercent}%
          </Text>
        </Group>
      </Button>
    </Tooltip>
  );
};

const SuggestionRow = ({ suggestion }: RowProps) => {
  const [updateSemanticType, semanticState] = useUpdateFieldMutation();
  const [updateSensitivity, sensitivityState] = useUpdateFieldMutation();

  const suggestedName =
    getSemanticTypeName(suggestion.suggested) ?? suggestion.suggested;
  const currentName = getSemanticTypeName(suggestion.current);

  const semanticType = suggestion.suggested;
  const sensitivitySuggested = suggestion.sensitivity?.suggested ?? null;
  const sensitivityLabel = sensitivityMeta(sensitivitySuggested)?.label;

  const showSemantic = hasSemanticChange(suggestion);
  const showSensitivity = hasSensitivityChange(suggestion);

  return (
    <Group align="center" gap="sm" justify="space-between" wrap="nowrap">
      <Stack gap={2} miw={0}>
        <Text fw="bold" truncate>
          {suggestion.field_name}
        </Text>
        {showSemantic && (
          <Text c="text-secondary" size="sm">
            {currentName
              ? t`${currentName} → ${suggestedName}`
              : t`Set type to ${suggestedName}`}
          </Text>
        )}
      </Stack>

      <Group gap="xs" wrap="nowrap">
        {showSensitivity && sensitivitySuggested != null && (
          <AcceptChip
            label={t`Label ${sensitivityLabel}`}
            confidence={suggestion.sensitivity?.confidence ?? null}
            isLoading={sensitivityState.isLoading}
            isSuccess={sensitivityState.isSuccess}
            onAccept={() =>
              updateSensitivity({
                id: suggestion.field_id,
                data_sensitivity: sensitivitySuggested,
              })
            }
          />
        )}
        {showSemantic && semanticType != null && (
          <AcceptChip
            label={t`Accept`}
            confidence={suggestion.confidence}
            isLoading={semanticState.isLoading}
            isSuccess={semanticState.isSuccess}
            onAccept={() =>
              updateSemanticType({
                id: suggestion.field_id,
                semantic_type: semanticType,
              })
            }
          />
        )}
      </Group>
    </Group>
  );
};

const ReadOnlyRow = ({ suggestion }: RowProps) => {
  const currentName = getSemanticTypeName(suggestion.current);

  return (
    <Group align="center" gap="sm" justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap" miw={0}>
        <Text truncate>{suggestion.field_name}</Text>
        <SensitivityBadge
          sensitivityClass={suggestion.sensitivity?.class ?? null}
          confidence={suggestion.sensitivity?.confidence ?? null}
        />
      </Group>
      <Text c="text-secondary" size="sm">
        {currentName ?? t`No semantic type`}
      </Text>
    </Group>
  );
};

import { t } from "ttag";

import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { Flex, Icon, Loader, Text, UnstyledButton } from "metabase/ui";

import type { WhyTarget } from "../preview/WhySidesheet";
import { getPreviewOption } from "../preview/preview-options";

type AccessSummarySidesheetProps = {
  isOpen: boolean;
  whoName: string;
  summary: { collections: WhyTarget[]; tables: WhyTarget[] } | null;
  onWhy: (target: WhyTarget) => void;
  onClose: () => void;
};

/** "Why?" when the frame shows no collection, dashboard or question: the person's access, each row with its own "why". */
export function AccessSummarySidesheet({
  isOpen,
  whoName,
  summary,
  onWhy,
  onClose,
}: AccessSummarySidesheetProps) {
  return (
    <Sidesheet
      title={t`What ${whoName} can reach`}
      isOpen={isOpen}
      onClose={onClose}
      withOverlay={false}
    >
      {summary == null ? (
        <Loader />
      ) : (
        <>
          <SidesheetCard title={t`Collections`}>
            {summary.collections.length === 0 && (
              <Text c="text-secondary">{t`No collection access applies.`}</Text>
            )}
            {summary.collections.map((target, index) => (
              <SummaryRow key={index} target={target} onWhy={onWhy} />
            ))}
          </SidesheetCard>
          <SidesheetCard title={t`Data`}>
            {summary.tables.map((target, index) => (
              <SummaryRow key={index} target={target} onWhy={onWhy} />
            ))}
          </SidesheetCard>
        </>
      )}
    </Sidesheet>
  );
}

function SummaryRow({
  target,
  onWhy,
}: {
  target: WhyTarget;
  onWhy: (target: WhyTarget) => void;
}) {
  const option = getPreviewOption(target.column, target.cell.value);
  const rows =
    target.column === "view_data" && target.security != null
      ? target.security.rows
      : null;

  return (
    <UnstyledButton onClick={() => onWhy(target)}>
      <Flex align="center" gap="sm" justify="space-between">
        <Text truncate="end" miw={0}>
          {target.subject.value}
        </Text>
        <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
          <Icon name={option.icon} c={option.iconColor} />
          <Text>{option.label}</Text>
        </Flex>
      </Flex>
      {rows != null && (
        <Text fz="sm" c="text-secondary">
          {t`Row security: ${rows}`}
        </Text>
      )}
    </UnstyledButton>
  );
}

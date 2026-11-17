import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { Badge, Flex, Icon, Stack, Text } from "metabase/ui";

import { formatList } from "../format-list";
import {
  type WhyTarget,
  getSourceGroupName,
  getWhyValueLabel,
} from "../preview/WhySidesheet";
import { getPreviewOption } from "../preview/preview-options";

/**
 * Why the person can or can't explore an item: one sentence per Create queries value, each table's value, and each
 * group's value with the one that applies. Laid out like a table's View data detail (`WhyContent`).
 */
export function CreateQueriesContent({ targets }: { targets: WhyTarget[] }) {
  const groups = getGroupRows(targets);
  return (
    <>
      <SidesheetCard title={t`Result`}>
        {getValueGroups(targets).map((valueTargets) => {
          const [first] = valueTargets;
          const option = getPreviewOption(first.column, first.cell.value);
          return (
            <Flex
              key={first.cell.value}
              align="flex-start"
              gap="sm"
              wrap="nowrap"
            >
              <Icon
                name={option.icon}
                c={option.iconColor}
                mt={2}
                style={{ flexShrink: 0 }}
              />
              <Text>{getResultSentence(valueTargets)}</Text>
            </Flex>
          );
        })}
      </SidesheetCard>

      <SidesheetCard title={t`Tables`}>
        <Stack gap="sm">
          {targets.map((target, index) => (
            <Flex
              key={index}
              align="center"
              justify="space-between"
              gap="md"
              wrap="nowrap"
            >
              <Text truncate>{target.title}</Text>
              <CreateQueriesValue target={target} value={target.cell.value} />
            </Flex>
          ))}
        </Stack>
      </SidesheetCard>

      {groups.length > 0 && (
        <SidesheetCard title={t`Groups`}>
          <Stack gap="sm">
            {groups.map((group) => (
              <Flex
                key={group.id}
                align="center"
                justify="space-between"
                gap="md"
                wrap="nowrap"
              >
                <Flex align="center" gap="sm" miw={0}>
                  <Text truncate>{group.name}</Text>
                  {group.applies && groups.length > 1 && (
                    <Badge variant="light" style={{ flexShrink: 0 }}>
                      {t`Applies`}
                    </Badge>
                  )}
                </Flex>
                {group.value != null ? (
                  <CreateQueriesValue target={targets[0]} value={group.value} />
                ) : (
                  <Text c="text-secondary">{t`Varies by table`}</Text>
                )}
              </Flex>
            ))}
          </Stack>
          {groups.length > 1 && (
            <Text>{t`The most permissive group applies.`}</Text>
          )}
        </SidesheetCard>
      )}
    </>
  );
}

/** The tables split by their Create queries value, in the order the values first appear. */
function getValueGroups(targets: WhyTarget[]) {
  const values = [...new Set(targets.map((target) => target.cell.value))];
  return values.map((value) =>
    targets.filter((target) => target.cell.value === value),
  );
}

/** "Sandy Sales can explore Orders and Products with the query builder, but not with native queries, from Sales." */
function getResultSentence(targets: WhyTarget[]) {
  const [first] = targets;
  const who = first.who;
  const names = formatList(targets.map((target) => target.title));
  const groupNames = new Set(
    targets.map((target) => getSourceGroupName(target.cell)),
  );
  const group = groupNames.size === 1 ? getSourceGroupName(first.cell) : null;
  switch (first.cell.value) {
    case "query-builder-and-native":
      return group != null
        ? t`${who} can explore ${names} with the query builder and native queries, from ${group}.`
        : t`${who} can explore ${names} with the query builder and native queries.`;
    case "query-builder":
      return group != null
        ? t`${who} can explore ${names} with the query builder, but not with native queries, from ${group}.`
        : t`${who} can explore ${names} with the query builder, but not with native queries.`;
    case "no":
      return t`${who} can't explore ${names}.`;
    default: {
      const value = getWhyValueLabel(first.column, first.cell.value);
      return t`${who} has Create queries set to ${value} on ${names}.`;
    }
  }
}

/**
 * Each group in any table's Create queries, with its value when every table gives it the same one; the group applies
 * when it's the source on every table.
 */
function getGroupRows(targets: WhyTarget[]) {
  const [first] = targets;
  const applyingId = targets.every(
    (target) => target.cell.group_id === first.cell.group_id,
  )
    ? first.cell.group_id
    : null;
  const groups = targets.flatMap((target) => target.cell.groups);
  const ids = [...new Set(groups.map((group) => group.group_id))];
  return ids
    .map((id) => {
      const matches = groups.filter((group) => group.group_id === id);
      const values = new Set(matches.map((group) => group.value));
      return {
        id,
        name: matches[0].name,
        value: values.size === 1 ? matches[0].value : null,
        applies: id === applyingId,
      };
    })
    .sort(
      (left, right) =>
        Number(right.applies) - Number(left.applies) ||
        left.name.localeCompare(right.name),
    );
}

function CreateQueriesValue({
  target,
  value,
}: {
  target: WhyTarget;
  value: string;
}) {
  const option = getPreviewOption(target.column, value);
  return (
    <Flex align="center" gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
      <Icon name={option.icon} c={option.iconColor} />
      <Text style={{ whiteSpace: "nowrap" }}>
        {getWhyValueLabel(target.column, value)}
      </Text>
    </Flex>
  );
}

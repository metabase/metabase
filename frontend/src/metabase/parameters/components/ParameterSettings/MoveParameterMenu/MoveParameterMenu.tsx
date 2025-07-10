import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { moveParameter } from "metabase/dashboard/actions";
import { getDashcardList, getTabs } from "metabase/dashboard/selectors";
import {
  findDashCardForInlineParameter,
  isHeadingDashCard,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Icon, type IconName, Select, Stack, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { BaseDashboardCard, ParameterId } from "metabase-types/api";

type MoveParameterMenuProps = {
  parameterId: ParameterId;
};

const TOP_NAV_VALUE = "top-nav";

export function MoveParameterMenu({ parameterId }: MoveParameterMenuProps) {
  const tabs = useSelector(getTabs);

  const dashcards = useSelector((state) =>
    getDashcardList(state).filter(
      (dashcard) => isHeadingDashCard(dashcard) || isQuestionDashCard(dashcard),
    ),
  );

  const parameterDashcard = useSelector((state) => {
    const dashcards = getDashcardList(state);
    return findDashCardForInlineParameter(parameterId, dashcards);
  });

  const dispatch = useDispatch();

  const dashcardsByTab = useMemo(
    () => _.groupBy(dashcards, "dashboard_tab_id"),
    [dashcards],
  );

  const dashcardMap = useMemo(() => _.indexBy(dashcards, "id"), [dashcards]);

  const handleChange = (value: string) => {
    if (value === TOP_NAV_VALUE) {
      dispatch(moveParameter({ parameterId, destination: value }));
    } else {
      dispatch(
        moveParameter({
          parameterId,
          destination: {
            id: Number(value),
            type: "dashcard",
          },
        }),
      );
    }
  };

  const renderOption = useCallback(
    ({ option }: { option: { value: string } }) => {
      if (option.value === TOP_NAV_VALUE) {
        return <SelectItem title={t`Top of page`} icon="dashboard" />;
      }
      const dashcard = dashcardMap[option.value];
      if (!dashcard) {
        return null;
      }
      return (
        <SelectItem
          title={
            isHeadingDashCard(dashcard)
              ? (dashcard.visualization_settings.text ?? t`Empty`)
              : dashcard.card.name
          }
          icon={getDashcardIcon(dashcard)}
          subtitle={isHeadingDashCard(dashcard) ? t`Heading` : t`Card`}
        />
      );
    },
    [dashcardMap],
  );

  const options = useMemo(() => {
    if (tabs.length > 1) {
      const tabGroups = tabs.map((tab) => ({
        group: tab.name,
        items: dashcardsByTab[tab.id]?.map((dc) => ({
          label: "",
          value: String(dc.id),
        })),
      }));
      tabGroups.unshift({
        group: "",
        items: [{ label: "", value: TOP_NAV_VALUE }],
      });
      return tabGroups;
    }
    return [];
  }, [dashcardsByTab, tabs]);

  return (
    <Select
      placeholder={t`Move filter`}
      data={options}
      renderOption={renderOption}
      value={parameterDashcard ? String(parameterDashcard?.id) : TOP_NAV_VALUE}
      onChange={handleChange}
    />
  );
}

function SelectItem({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
}) {
  return (
    <Group p="sm">
      <Icon name={icon} />
      <Stack gap="xs">
        <Text fw="400" lh="sm">
          {title}
        </Text>
        {!!subtitle && <Text size="sm">{subtitle}</Text>}
      </Stack>
    </Group>
  );
}

function getDashcardIcon(dashcard: BaseDashboardCard) {
  if (isHeadingDashCard(dashcard)) {
    return "string";
  }
  return visualizations.get(dashcard.card.display)?.iconName ?? "beaker";
}

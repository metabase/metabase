import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
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

import S from "./MoveParameterMenu.module.css";

type MoveParameterMenuProps = {
  parameterId: ParameterId;
};

const TOP_NAV_VALUE = "top-nav";

export function MoveParameterMenu({ parameterId }: MoveParameterMenuProps) {
  const [isOpen, { open: onOpen, close: onClose }] = useDisclosure(false);

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

  const _tabs = useSelector(getTabs);
  const tabsWithDashcards = useMemo(
    () => _tabs.filter((tab) => dashcardsByTab[tab.id]?.length > 0),
    [dashcardsByTab, _tabs],
  );

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
    ({ option, checked }: { option: { value: string }; checked?: boolean }) => {
      if (option.value === TOP_NAV_VALUE) {
        return (
          <SelectItem
            title={t`Top of page`}
            icon="dashboard"
            checked={checked}
          />
        );
      }
      const dashcard = dashcardMap[option.value];
      if (!dashcard) {
        return null;
      }
      return (
        <SelectItem
          title={getDashcardTitle(dashcard)}
          icon={getDashcardIcon(dashcard)}
          subtitle={isHeadingDashCard(dashcard) ? t`Heading` : t`Card`}
          checked={checked}
        />
      );
    },
    [dashcardMap],
  );

  const options = useMemo(() => {
    const rootGroup = {
      group: "",
      items: [{ label: "", value: TOP_NAV_VALUE }],
    };
    const groups = [rootGroup];

    if (tabsWithDashcards.length > 0) {
      groups.push(
        ...tabsWithDashcards.map((tab) => ({
          group: tab.name,
          items: dashcardsByTab[tab.id]?.map((dc) => ({
            label: "",
            value: String(dc.id),
          })),
        })),
      );
    } else {
      rootGroup.items.push(
        ...dashcards.map((dc) => ({
          label: "",
          value: String(dc.id),
        })),
      );
    }

    return groups;
  }, [dashcards, dashcardsByTab, tabsWithDashcards]);

  return (
    <Select
      classNames={{
        input: !isOpen ? S.CollapsedMoveParameterMenuInput : undefined,
        section: !isOpen ? CS.hidden : undefined,
      }}
      placeholder={t`Move filter`}
      data={options}
      renderOption={renderOption}
      value={parameterDashcard ? String(parameterDashcard?.id) : TOP_NAV_VALUE}
      onChange={handleChange}
      onDropdownOpen={onOpen}
      onDropdownClose={onClose}
    />
  );
}

function SelectItem({
  icon,
  title,
  subtitle,
  checked = false,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  checked?: boolean;
}) {
  return (
    <Group p="sm">
      <Icon name={icon} />
      <Stack gap="xs">
        <Text fw="400" lh="sm" c={checked ? "text-white" : "text-dark"}>
          {title}
        </Text>
        {!!subtitle && (
          <Text size="sm" c={checked ? "text-white" : "text-dark"}>
            {subtitle}
          </Text>
        )}
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

function getDashcardTitle(dashcard: BaseDashboardCard) {
  if (isHeadingDashCard(dashcard)) {
    return dashcard.visualization_settings.text ?? t`Empty`;
  }
  return dashcard.visualization_settings?.["card.title"] || dashcard.card.name;
}

import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { moveParameter } from "metabase/dashboard/actions";
import { getCurrentDashcards, getTabs } from "metabase/dashboard/selectors";
import {
  findDashCardForInlineParameter,
  isHeadingDashCard,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, Group, Icon, type IconName, Select, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { BaseDashboardCard, ParameterId } from "metabase-types/api";

import S from "./MoveParameterMenu.module.css";

type MoveParameterMenuProps = {
  parameterId: ParameterId;
};

const TOP_NAV_VALUE = "top-nav";

export function MoveParameterMenu({ parameterId }: MoveParameterMenuProps) {
  const [isOpen, { open: onOpen, close: _onClose }] = useDisclosure(false);
  const ref = useRef<HTMLInputElement>(null);

  const dashcards = useSelector((state) =>
    getCurrentDashcards(state).filter(
      (dashcard) => isHeadingDashCard(dashcard) || isQuestionDashCard(dashcard),
    ),
  );

  const parameterDashcard = useSelector((state) => {
    const dashcards = getCurrentDashcards(state);
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

  const handleClose = () => {
    _onClose();
    ref.current?.blur();
  };

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
          title={getDashcardTitle(dashcard)}
          icon={getDashcardIcon(dashcard)}
        />
      );
    },
    [dashcardMap],
  );

  const value = useMemo(() => {
    if (!isOpen) {
      return;
    }
    return parameterDashcard ? String(parameterDashcard?.id) : TOP_NAV_VALUE;
  }, [isOpen, parameterDashcard]);

  const options = useMemo(() => {
    const rootGroup = {
      group: "",
      items: [{ label: t`Top of page`, value: TOP_NAV_VALUE }],
    };
    const groups = [rootGroup];

    if (tabsWithDashcards.length > 0) {
      groups.push(
        ...tabsWithDashcards.map((tab) => ({
          group: tab.name,
          items: dashcardsByTab[tab.id]?.map((dc) => ({
            label: getDashcardTitle(dc),
            value: String(dc.id),
          })),
        })),
      );
    } else {
      rootGroup.items.push(
        ...dashcards.map((dc) => ({
          label: getDashcardTitle(dc),
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
        option: S.MoveParameterMenuOption,

        // Hides the chevron-down icon on the right to make it look like a button
        section: !isOpen ? CS.hidden : undefined,
      }}
      placeholder={t`Move filter`}
      data={options}
      renderOption={renderOption}
      value={value}
      onChange={handleChange}
      searchable
      onDropdownOpen={onOpen}
      onDropdownClose={handleClose}
      ref={ref}
    />
  );
}

function SelectItem({ icon, title }: { icon: IconName; title: string }) {
  return (
    <Group p="sm" w="100%">
      <Flex direction="column" flex={1} justify="center" gap="xs" miw={0}>
        <Text
          className={S.MoveParameterMenuOptionText}
          fw="400"
          lh="sm"
          truncate="end"
        >
          {title}
        </Text>
      </Flex>
      <Icon className={S.MoveParameterMenuOptionIcon} name={icon} />
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
  const dashcardTitle = dashcard.visualization_settings?.["card.title"];
  if (typeof dashcardTitle === "string") {
    return dashcardTitle;
  }
  return dashcard.card.name ?? t`Card`;
}

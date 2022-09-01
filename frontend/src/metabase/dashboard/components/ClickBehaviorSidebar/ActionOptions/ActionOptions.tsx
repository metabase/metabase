import React, { useCallback } from "react";
import { t } from "ttag";

import Actions from "metabase/entities/actions";

import ClickMappings from "metabase/dashboard/components/ClickMappings";

import type {
  DashboardOrderedCard,
  ClickBehavior,
  WritebackAction,
} from "metabase-types/api";

import { Heading, SidebarContent } from "../ClickBehaviorSidebar.styled";
import ActionOptionItem from "./ActionOptionItem";

interface ActionOptionsProps {
  dashcard: DashboardOrderedCard;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

function ActionOptions({
  actions,
  dashcard,
  clickBehavior,
  updateSettings,
}: ActionOptionsProps & { actions: WritebackAction[] }) {
  const handleActionSelected = useCallback(
    (action: WritebackAction) => {
      updateSettings({
        type: clickBehavior.type,
      });
    },
    [clickBehavior, updateSettings],
  );

  const selectedAction = null;

  return (
    <>
      {actions.map(action => (
        <ActionOptionItem
          key={action.id}
          name={action.name}
          description={action.description}
          isSelected={false}
          onClick={() => handleActionSelected(action)}
        />
      ))}
      {selectedAction && (
        <ClickMappings
          isAction
          object={selectedAction}
          dashcard={dashcard}
          clickBehavior={clickBehavior}
          updateSettings={updateSettings}
        />
      )}
    </>
  );
}

function ActionOptionsContainer(props: ActionOptionsProps) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick an action`}</Heading>
      <Actions.ListLoader loadingAndErrorWrapper={false}>
        {({ actions = [] }: { actions: WritebackAction[] }) => (
          <ActionOptions {...props} actions={actions} />
        )}
      </Actions.ListLoader>
    </SidebarContent>
  );
}

export default ActionOptionsContainer;

import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import type { Card } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type ModelHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function ModelHeader({ card, actions }: ModelHeaderProps) {
  return (
    <PaneHeader
      title={<ModelNameInput card={card} />}
      tabs={card != null && <ModelTabs card={card} />}
      actions={actions}
    />
  );
}

type ModelNameInputProps = {
  card: Card;
  onChangeName?: (name: string) => void;
};

function ModelNameInput({ card }: ModelNameInputProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateCard({
      id: card.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update model name`);
    } else {
      sendSuccessToast(t`Model name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={card.name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
    />
  );
}

type ModelTabsProps = {
  card: Card;
};

function ModelTabs({ card }: ModelTabsProps) {
  const location = useSelector(getLocation);
  const tabs = getTabs(card, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(card: Card, { pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Overview`,
      to: Urls.dataStudioModel(card.id),
      isSelected: Urls.dataStudioModel(card.id) === pathname,
    },
    {
      label: t`Query`,
      to: Urls.dataStudioModelQuery(card.id),
      isSelected: Urls.dataStudioModelQuery(card.id) === pathname,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioModelDependencies(card.id),
            isSelected: Urls.dataStudioModelDependencies(card.id) === pathname,
          },
        ]
      : []),
  ];
}

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
import type { Card, CardId } from "metabase-types/api";

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
  const tabs = getTabs(card.id, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(id: CardId, { pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Overview`,
      to: Urls.dataStudioModel(id),
      isSelected: Urls.dataStudioModel(id) === pathname,
    },
    {
      label: t`Query`,
      to: Urls.dataStudioModelQuery(id),
      isSelected: Urls.dataStudioModelQuery(id) === pathname,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioModelDependencies(id),
            isSelected: Urls.dataStudioModelDependencies(id) === pathname,
          },
        ]
      : []),
  ];
}

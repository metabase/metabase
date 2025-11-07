import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
  PanelHeaderTitle,
} from "metabase/data-studio/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";
import { CardMoreMenu } from "../CardMoreMenu";

type ModelHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function ModelHeader({ card, actions }: ModelHeaderProps) {
  return (
    <PaneHeader
      icon="model"
      title={
        card.can_write ? (
          <ModelNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
      menu={<CardMoreMenu card={card} />}
      tabs={<ModelTabs card={card} />}
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
  const metadata = useSelector(getMetadata);
  const tabs = getTabs(card, metadata);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(card: Card, metadata: Metadata): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioModel(card.id),
    },
  ];

  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);
  if (queryInfo.isEditable) {
    tabs.push({
      label: t`Query`,
      to: Urls.dataStudioModelQuery(card.id),
    });
  }

  tabs.push({
    label: t`Fields`,
    to: Urls.dataStudioModelFields(card.id),
  });

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioModelDependencies(card.id),
    });
  }

  return tabs;
}

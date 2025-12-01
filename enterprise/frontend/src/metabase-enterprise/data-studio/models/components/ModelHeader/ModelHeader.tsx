import type { ReactNode } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { CardMoreMenu } from "metabase/questions/components/CardMoreMenu";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
  PanelHeaderTitle,
} from "../../../common/components/PaneHeader";
import { NAME_MAX_LENGTH } from "../../constants";

type ModelHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function ModelHeader({ card, actions }: ModelHeaderProps) {
  return (
    <PaneHeader
      data-testid="model-header"
      title={
        card.can_write ? (
          <ModelNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
      icon="model"
      menu={<ModelMoreMenu card={card} />}
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

type ModelMoreMenuProps = {
  card: Card;
};

function ModelMoreMenu({ card }: ModelMoreMenuProps) {
  const dispatch = useDispatch();

  const handleCopy = (newCard: Card) => {
    dispatch(push(Urls.dataStudioModel(newCard.id)));
  };

  const handleArchive = () => {
    dispatch(push(Urls.dataStudioModeling()));
  };

  const handleUnarchive = () => {
    dispatch(push(Urls.dataStudioModel(card.id)));
  };

  return (
    <CardMoreMenu
      card={card}
      onCopy={handleCopy}
      onArchive={handleArchive}
      onUnarchive={handleUnarchive}
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
      label: t`Definition`,
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

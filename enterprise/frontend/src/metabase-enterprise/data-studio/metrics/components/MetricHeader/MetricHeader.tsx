import type { ReactNode } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
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

import { CardMoreMenu } from "./CardMoreMenu";

type MetricHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function MetricHeader({ card, actions }: MetricHeaderProps) {
  return (
    <PaneHeader
      data-testid="metric-header"
      title={
        card.can_write ? (
          <MetricNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
      icon="metric"
      menu={<MetricMoreMenu card={card} />}
      tabs={<MetricTabs card={card} />}
      actions={actions}
    />
  );
}

type MetricNameInputProps = {
  card: Card;
  onChangeName?: (name: string) => void;
};

function MetricNameInput({ card }: MetricNameInputProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateCard({
      id: card.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update metric name`);
    } else {
      sendSuccessToast(t`Metric name updated`);
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

type MetricMoreMenuProps = {
  card: Card;
};

function MetricMoreMenu({ card }: MetricMoreMenuProps) {
  const dispatch = useDispatch();

  const handleCopy = (newCard: Card) => {
    dispatch(push(Urls.dataStudioMetric(newCard.id)));
  };

  const handleArchive = () => {
    dispatch(push(Urls.dataStudioModeling()));
  };

  const handleUnarchive = () => {
    dispatch(push(Urls.dataStudioMetric(card.id)));
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

type MetricTabsProps = {
  card: Card;
};

function MetricTabs({ card }: MetricTabsProps) {
  const metadata = useSelector(getMetadata);
  const tabs = getTabs(card, metadata);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(card: Card, metadata: Metadata): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioMetric(card.id),
    },
  ];

  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);
  if (queryInfo.isEditable) {
    tabs.push({
      label: t`Definition`,
      to: Urls.dataStudioMetricQuery(card.id),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioMetricDependencies(card.id),
    });
  }

  return tabs;
}

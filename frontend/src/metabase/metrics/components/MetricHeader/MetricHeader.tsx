import type { Location } from "history";
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
import { getLocation } from "metabase/selectors/routing";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type MetricHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function MetricHeader({ card, actions }: MetricHeaderProps) {
  return (
    <PaneHeader
      title={
        card.can_write ? (
          <MetricNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
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

type MetricTabsProps = {
  card: Card;
};

function MetricTabs({ card }: MetricTabsProps) {
  const metadata = useSelector(getMetadata);
  const location = useSelector(getLocation);
  const tabs = getTabs(card, metadata, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(
  card: Card,
  metadata: Metadata,
  { pathname }: Location,
): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioMetric(card.id),
      isSelected: Urls.dataStudioMetric(card.id) === pathname,
    },
  ];

  if (card.can_write) {
    const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
    const queryInfo = Lib.queryDisplayInfo(query);

    if (queryInfo.isEditable) {
      tabs.push({
        label: t`Query`,
        to: Urls.dataStudioMetricQuery(card.id),
        isSelected: Urls.dataStudioMetricQuery(card.id) === pathname,
      });
    }
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioMetricDependencies(card.id),
      isSelected: Urls.dataStudioMetricDependencies(card.id) === pathname,
    });
  }

  return tabs;
}

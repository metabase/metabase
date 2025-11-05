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

type MetricHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function MetricHeader({ card, actions }: MetricHeaderProps) {
  return (
    <PaneHeader
      title={<MetricNameInput card={card} />}
      tabs={card != null && <MetricTabs card={card} />}
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
  const location = useSelector(getLocation);
  const tabs = getTabs(card.id, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(id: CardId, { pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Overview`,
      to: Urls.dataStudioMetric(id),
      isSelected: Urls.dataStudioMetric(id) === pathname,
    },
    {
      label: t`Query`,
      to: Urls.dataStudioMetricQuery(id),
      isSelected: Urls.dataStudioMetricQuery(id) === pathname,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioMetricDependencies(id),
            isSelected: Urls.dataStudioMetricDependencies(id) === pathname,
          },
        ]
      : []),
  ];
}

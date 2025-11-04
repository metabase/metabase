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
import type { CardId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type ModelHeaderProps = {
  id?: CardId;
  name: string;
  actions?: ReactNode;
  onChangeName?: (name: string) => void;
};

export function ModelHeader({
  id,
  name,
  actions,
  onChangeName,
}: ModelHeaderProps) {
  return (
    <PaneHeader
      title={<ModelNameInput id={id} name={name} onChangeName={onChangeName} />}
      tabs={id != null && <ModelTabs id={id} />}
      actions={actions}
    />
  );
}

type ModelNameInputProps = {
  id: CardId | undefined;
  name: string;
  onChangeName?: (name: string) => void;
};

function ModelNameInput({ id, name, onChangeName }: ModelNameInputProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    onChangeName?.(newName);

    if (id == null) {
      return;
    }

    const { error } = await updateCard({
      id,
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
      initialValue={name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
    />
  );
}

type ModelTabsProps = {
  id: CardId;
};

function ModelTabs({ id }: ModelTabsProps) {
  const location = useSelector(getLocation);
  const tabs = getTabs(id, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(id: CardId, { pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Overview`,
      to: Urls.dataStudioModel(id),
      icon: "sql",
      isSelected: Urls.dataStudioModel(id) === pathname,
    },
    {
      label: t`Query`,
      to: Urls.dataStudioModelQuery(id),
      icon: "sql",
      isSelected: Urls.dataStudioModelQuery(id) === pathname,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioModelDependencies(id),
            icon: "schema" as const,
            isSelected: Urls.dataStudioModelDependencies(id) === pathname,
          },
        ]
      : []),
  ];
}

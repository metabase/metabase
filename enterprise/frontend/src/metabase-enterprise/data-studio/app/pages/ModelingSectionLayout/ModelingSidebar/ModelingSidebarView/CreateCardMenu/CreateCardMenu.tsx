import type { MouseEvent } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Button, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

type CreateCardMenuProps = {
  modelCollectionId?: CollectionId;
  metricCollectionId?: CollectionId;
  canCreateModel: boolean;
  canCreateMetric: boolean;
  canCreateNativeQuery: boolean;
};

export function CreateCardMenu({
  modelCollectionId,
  metricCollectionId,
  canCreateModel,
  canCreateMetric,
  canCreateNativeQuery,
}: CreateCardMenuProps) {
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Menu position="bottom-end">
      <Tooltip label={t`Create model or metric`}>
        <Menu.Target>
          <Button
            w={24}
            h={24}
            size="compact-xs"
            variant="subtle"
            c="text-medium"
            aria-label={t`Create model or metric`}
            leftSection={<FixedSizeIcon name="add" size={16} />}
            onClick={handleClick}
          />
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        {canCreateModel && canCreateNativeQuery && (
          <Menu.Sub>
            <Menu.Sub.Target>
              <Menu.Sub.Item leftSection={<FixedSizeIcon name="model" />}>
                {t`Model`}
              </Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              <Menu.Item
                component={ForwardRefLink}
                to={Urls.newDataStudioQueryModel({
                  collectionId: modelCollectionId,
                })}
                leftSection={<FixedSizeIcon name="notebook" />}
                onClick={handleClick}
              >
                {t`Query builder`}
              </Menu.Item>
              <Menu.Item
                component={ForwardRefLink}
                to={Urls.newDataStudioNativeModel({
                  collectionId: modelCollectionId,
                })}
                leftSection={<FixedSizeIcon name="sql" />}
                onClick={handleClick}
              >
                {t`SQL query`}
              </Menu.Item>
            </Menu.Sub.Dropdown>
          </Menu.Sub>
        )}
        {canCreateModel && !canCreateNativeQuery && (
          <Menu.Item
            component={ForwardRefLink}
            to={Urls.newDataStudioQueryModel({
              collectionId: modelCollectionId,
            })}
            leftSection={<FixedSizeIcon name="model" />}
            onClick={handleClick}
          >
            {t`Model`}
          </Menu.Item>
        )}
        {canCreateMetric && (
          <Menu.Item
            component={ForwardRefLink}
            to={Urls.newDataStudioMetric({ collectionId: metricCollectionId })}
            leftSection={<FixedSizeIcon name="metric" />}
            onClick={handleClick}
          >
            {t`Metric`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

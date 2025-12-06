import type { MouseEvent } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Button, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

type CreateCardMenuProps = {
  metricCollectionId?: CollectionId;
};

export function CreateCardMenu({ metricCollectionId }: CreateCardMenuProps) {
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Menu position="bottom-end">
      <Tooltip label={t`Create a metric`}>
        <Menu.Target>
          <Button
            w={24}
            h={24}
            size="compact-xs"
            variant="subtle"
            c="text-medium"
            aria-label={t`Create a metric`}
            leftSection={<FixedSizeIcon name="add" size={16} />}
            onClick={handleClick}
          />
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.newDataStudioMetric({ collectionId: metricCollectionId })}
          leftSection={<FixedSizeIcon name="metric" />}
          onClick={handleClick}
        >
          {t`Metric`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

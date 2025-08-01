import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import { Icon, NavLink, Stack, UnstyledButton } from "metabase/ui";
import { getTransformUrl } from "metabase-enterprise/transforms/urls";
import type { Transform, TransformId } from "metabase-types/api";

import S from "./TransformList.module.css";

type TransformListProps = {
  transforms: Transform[];
  transformId?: TransformId;
};

export function TransformList({ transforms, transformId }: TransformListProps) {
  const [isExpanded, { toggle }] = useDisclosure(transformId != null);

  return (
    <Stack gap="xs">
      <NavLink
        component={UnstyledButton}
        variant="admin-nav"
        label={t`Transforms`}
        leftSection={<Icon name="refresh_downstream" />}
        rightSection={
          <Icon
            className={cx(S.chevron, { [S.expanded]: isExpanded })}
            name="chevronright"
            size={12}
          />
        }
        onClick={toggle}
      />
      {isExpanded && (
        <Stack gap="xs" pl="lg">
          {transforms.map((transform) => (
            <AdminNavItem
              key={transform.id}
              label={transform.name}
              path={getTransformUrl(transform.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

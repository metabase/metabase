import type { FunctionComponent } from "react";
import { t } from "ttag";

import type { GroupItem } from "metabase/querying/filters/types";
import { Button, Icon, Menu } from "metabase/ui";

interface Props {
  className?: string;
  groupItems: GroupItem[];
  value: string | null;
  onChange: (value: string) => void;
}

export const FieldGroupPicker: FunctionComponent<Props> = ({
  className,
  groupItems,
  value,
  onChange,
}) => {
  const label = groupItems.find(option => option.key === value)?.displayName;

  return (
    <div className={className}>
      <span>{t`Show fields in`}</span>

      <Menu position="bottom-start">
        <Menu.Target>
          <Button
            variant="subtle"
            color="brand"
            rightIcon={<Icon ml={-4} name="chevrondown" size={12} />}
            p="xs"
            aria-label={t`Show fields in`}
          >
            {label}
          </Button>
        </Menu.Target>

        <Menu.Dropdown>
          {groupItems.map(item => (
            <Menu.Item
              key={item.key}
              aria-selected={item.key === value}
              onClick={() => onChange(item.key)}
            >
              {item.displayName}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};

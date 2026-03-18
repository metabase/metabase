import { t } from "ttag";

import { useTransientColumnVisibility } from "metabase/dashboard/components/DashCard/TransientColumnVisibilityContext";
import { Checkbox, Icon, Menu } from "metabase/ui";

export const DashCardColumnsMenuItem = () => {
  const columnVisibility = useTransientColumnVisibility();

  if (!columnVisibility || columnVisibility.allColumns.length === 0) {
    return null;
  }

  const { allColumns, hiddenColumnIds, toggleColumnVisibility } =
    columnVisibility;

  return (
    <Menu trigger="click-hover" shadow="md" position="right" width={220}>
      <Menu.Target>
        <Menu.Item
          fw="bold"
          styles={{
            item: {
              backgroundColor: "transparent",
              color: "var(--mb-color-text-primary)",
            },
            itemSection: {
              color: "var(--mb-color-text-primary)",
            },
          }}
          leftSection={<Icon name="eye" aria-hidden />}
          rightSection={<Icon name="chevronright" aria-hidden />}
        >
          {t`Columns`}
        </Menu.Item>
      </Menu.Target>
      <Menu.Dropdown data-testid="dashcard-menu-columns">
        {allColumns.map(({ id, name }) => (
          <Menu.Item
            key={id}
            closeMenuOnClick={false}
            onClick={() => toggleColumnVisibility(id)}
            leftSection={
              <Checkbox
                size="xs"
                checked={!hiddenColumnIds.has(id)}
                onChange={() => toggleColumnVisibility(id)}
                readOnly
              />
            }
          >
            {name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

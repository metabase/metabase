import { t } from "ttag";

import { ActionIcon, Box, Icon, Menu, Tooltip } from "metabase/ui";

interface Props {
  style?: "normal" | "bold" | "dim" | "title";
  hasTitleOption?: boolean;
  actionIconProps?: any;
  onStyleChange: (style: "normal" | "bold" | "dim" | "title") => void;
}

export const ColumnFormatControl = ({
  style = "normal",
  hasTitleOption = true,
  actionIconProps,
  onStyleChange,
}: Props) => {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Tooltip label={t`Change style`}>
          <ActionIcon
            aria-label={t`Change style`}
            fw={style === "bold" ? "bold" : undefined}
            {...actionIconProps}
            variant="transparent"
          >
            <Box c={style === "dim" ? "text-light" : "text-primary"}>
              <Icon name={style === "bold" ? "bold" : "string"} />
            </Box>
          </ActionIcon>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="string" />}
          onClick={() => onStyleChange("normal")}
        >
          {t`Normal`}
        </Menu.Item>
        {hasTitleOption && (
          <Menu.Item
            fw="bold"
            leftSection={<Icon name="bold" />}
            onClick={() => onStyleChange("title")}
          >
            {t`Title`}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<Icon name="bold" />}
          fw="bold"
          onClick={() => onStyleChange("bold")}
        >
          {t`Bold`}
        </Menu.Item>
        <Menu.Item
          c="text-light"
          leftSection={<Icon name="string" />}
          onClick={() => onStyleChange("dim")}
        >
          {t`Dim`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

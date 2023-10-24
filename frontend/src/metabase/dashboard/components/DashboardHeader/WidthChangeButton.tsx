import { useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "metabase/core/components/Icon";
import { DASHBOARD_MAX_WIDTHS } from "metabase/dashboard/constants";
import { Menu, Button, Text, TextInput } from "metabase/ui";

export const WidthChangeButton = ({
  maxWidth,
  setMaxWidth,
}: {
  maxWidth: CSSProperties["maxWidth"];
  setMaxWidth: (x: CSSProperties["maxWidth"]) => void;
}) => {
  const [widthInput, setWidthInput] = useState<string>(maxWidth as string);

  const invalidErrorMessages = (w: string) =>
    (w.length === 0 && "Width is required") ||
    (w.length > 0 && !CSS.supports("max-width", w) && "Invalid width");

  const onNewValue = (val?: string) => {
    if (val && !invalidErrorMessages(val)) {
      setWidthInput(val);
      setMaxWidth(val);
    }
  };

  return (
    <TextInput
      radius="lg"
      value={widthInput}
      onChange={e => setWidthInput(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") {
          onNewValue(widthInput);
        }
      }}
      error={invalidErrorMessages(widthInput)}
      rightSection={
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              mr="sm"
              leftIcon={<Icon name="chevrondown" />}
              variant="filled"
              compact
            />
          </Menu.Target>

          <Menu.Dropdown>
            {DASHBOARD_MAX_WIDTHS.map(width => (
              <Menu.Item
                bg={maxWidth === width ? "brand.0" : undefined}
                key={width}
                onClick={() => onNewValue(width as string)}
              >
                <Text c="text.2" fw={700} fz="lg">
                  {width}
                </Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      }
    />
  );
};

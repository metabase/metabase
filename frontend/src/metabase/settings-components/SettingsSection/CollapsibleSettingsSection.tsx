import cx from "classnames";
import type React from "react";
import { useState } from "react";

import { Accordion, Box, type BoxProps, Icon, Text } from "metabase/ui";

import { SETTINGS_CARD_DESCRIPTION_PROPS } from "./SettingsSection";
import S from "./SettingsSection.module.css";

const COLLAPSIBLE_SECTION_VALUE = "section";

export function CollapsibleSettingsSection({
  title,
  description,
  defaultOpened = false,
  disabled = false,
  children,
  className,
  ...boxProps
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpened?: boolean;
  // greys the card out, keeps it closed and keeps it from toggling
  disabled?: boolean;
  children?: React.ReactNode;
} & BoxProps) {
  // a card that defaults open while disabled opens once it is enabled
  const [isOpened, setIsOpened] = useState(defaultOpened);
  return (
    <Accordion
      className={cx(
        S.CollapsibleAccordion,
        disabled && S.DisabledSection,
        className,
      )}
      classNames={{
        item: S.CollapsibleItem,
        control: S.CollapsibleControl,
        label: S.CollapsibleLabel,
        chevron: S.CollapsibleChevron,
        content: S.CollapsibleContent,
        panel: S.CollapsiblePanel,
      }}
      chevron={<Icon aria-hidden name="chevrondown" />}
      order={2}
      value={isOpened && !disabled ? COLLAPSIBLE_SECTION_VALUE : null}
      onChange={(value) => setIsOpened(value != null)}
      {...boxProps}
    >
      <Accordion.Item value={COLLAPSIBLE_SECTION_VALUE}>
        {/* the header wrapper anchors the control's stretched hit area, so
            the whole header row toggles while the description stays outside
            the control button and out of its accessible name */}
        <Box className={S.CollapsibleHeader}>
          <Accordion.Control disabled={disabled}>{title}</Accordion.Control>
          {description && (
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {description}
            </Text>
          )}
        </Box>
        <Accordion.Panel>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

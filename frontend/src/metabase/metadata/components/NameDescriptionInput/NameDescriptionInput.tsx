import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, Group, Icon, type IconName, Text, rem } from "metabase/ui";

import { Input } from "./Input";
import S from "./NameDescriptionInput.module.css";
import { Textarea } from "./Textarea";

interface Props {
  name: string;
  nameIcon: IconName;
  nameMaxLength?: number;
  namePlaceholder: string;
  namePrefix?: string;
  nameRightSection?: ReactNode;
  description: string;
  descriptionPlaceholder: string;
  readOnly?: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
}

export const NameDescriptionInput = ({
  name,
  nameIcon,
  nameMaxLength,
  namePlaceholder,
  namePrefix,
  nameRightSection,
  description,
  descriptionPlaceholder,
  readOnly,
  onNameChange,
  onDescriptionChange,
}: Props) => {
  const { ref, width } = useElementSize();
  const { ref: sectionRef, width: sectionWidth } = useElementSize();
  const leftSectionWidth = Math.max(sectionWidth, 40);

  const handleDescriptionChange = (value: string) => {
    const newDescription = value.trim();

    if (description !== newDescription) {
      onDescriptionChange(newDescription);
    }
  };

  const handleNameChange = (value: string) => {
    const newName = value.trim();

    if (name !== newName) {
      onNameChange(newName);
    }
  };

  return (
    <Box ref={ref}>
      <Input
        classNames={{
          input: S.nameInput,
          root: S.name,
          section: S.section,
        }}
        fw="bold"
        leftSection={
          <Group
            align="center"
            c="text-tertiary"
            gap={10}
            flex="1"
            fs="lg"
            lh="normal"
            maw={rem(Math.floor(width / 2))}
            px={rem(10)}
            ref={sectionRef}
            wrap="nowrap"
          >
            <Icon flex="0 0 auto" name={nameIcon} size={20} c="brand" />

            {namePrefix && (
              <Ellipsified
                data-testid="name-prefix"
                lines={1}
                tooltip={namePrefix}
              >
                <Text c="text-tertiary" component="span" size="lg">
                  {namePrefix}
                  {":"}
                </Text>
              </Ellipsified>
            )}
          </Group>
        }
        leftSectionWidth={leftSectionWidth}
        normalize={(newValue) => {
          if (typeof newValue !== "string") {
            return name;
          }

          const isNewValueEmpty = newValue.trim().length === 0;
          return isNewValueEmpty ? name : newValue.trim();
        }}
        maxLength={nameMaxLength}
        placeholder={namePlaceholder}
        required
        rightSection={nameRightSection}
        size="lg"
        styles={{
          section: {
            // limit the flicker when element is being measured for the first time
            visibility: sectionWidth === 0 ? "hidden" : undefined,
          },
          input: {
            paddingLeft: leftSectionWidth,
          },
        }}
        value={name}
        readOnly={readOnly}
        onChange={handleNameChange}
      />

      <Textarea
        autosize
        classNames={{
          input: S.descriptionInput,
          root: S.description,
        }}
        maxRows={4}
        minRows={2}
        placeholder={descriptionPlaceholder}
        value={description}
        readOnly={readOnly}
        onChange={handleDescriptionChange}
      />
    </Box>
  );
};

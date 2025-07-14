import { useElementSize } from "@mantine/hooks";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, Group, Icon, type IconName, Text, rem } from "metabase/ui";

import { Input } from "./Input";
import S from "./NameDescriptionInput.module.css";
import { Textarea } from "./Textarea";

interface Props {
  description: string;
  descriptionPlaceholder: string;
  name: string;
  nameIcon: IconName;
  nameMaxLength?: number;
  namePlaceholder: string;
  namePrefix?: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
}

export const NameDescriptionInput = ({
  description,
  descriptionPlaceholder,
  name,
  nameIcon,
  nameMaxLength,
  namePlaceholder,
  namePrefix,
  onDescriptionChange,
  onNameChange,
}: Props) => {
  const { ref, width } = useElementSize();
  const { ref: sectionRef, width: sectionWidth } = useElementSize();
  const leftSectionWidth = sectionWidth > 0 ? sectionWidth : 40;

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
            c="text-light"
            gap={10}
            flex="1"
            fs="lg"
            lh="normal"
            maw={rem(Math.floor(width / 2))}
            px={rem(10)}
            ref={sectionRef}
            wrap="nowrap"
          >
            <Icon c="brand" flex="0 0 auto" name={nameIcon} size={20} />

            {namePrefix && (
              <Ellipsified
                data-testid="name-prefix"
                lines={1}
                tooltip={namePrefix}
              >
                <Text c="text-light" component="span" size="lg">
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
        onChange={onNameChange}
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
        onChange={onDescriptionChange}
      />
    </Box>
  );
};

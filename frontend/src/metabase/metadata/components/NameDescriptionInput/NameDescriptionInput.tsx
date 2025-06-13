import { Box, Flex, Icon, type IconName, rem } from "metabase/ui";

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
  onDescriptionChange,
  onNameChange,
}: Props) => {
  return (
    <Box>
      <Input
        classNames={{
          input: S.nameInput,
          root: S.name,
        }}
        fw="bold"
        leftSection={
          <Flex
            align="center"
            bg="brand"
            className={S.iconContainer}
            h={rem(24)}
            justify="center"
            w={rem(24)}
          >
            <Icon c="white" name={nameIcon} size={12} />
          </Flex>
        }
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

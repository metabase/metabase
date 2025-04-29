import { useLayoutEffect, useState } from "react";

import { Flex, Icon, TextInput } from "metabase/ui";

import S from "./NameDescriptionInput.module.css";

interface Props {
  description: string;
  descriptionPlaceholder: string;
  name: string;
  namePlaceholder: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
}

/**
 * Controlled component that fires onChange events on blur
 */
export const NameDescriptionInput = ({
  description,
  descriptionPlaceholder,
  name,
  namePlaceholder,
  onDescriptionChange,
  onNameChange,
}: Props) => {
  const [nameState, setNameState] = useState(name);
  const [descriptionState, setDescriptionState] = useState(description);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isNameHovered, setIsNameHovered] = useState(false);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const [isDescriptionHovered, setIsDescriptionHovered] = useState(false);

  useLayoutEffect(() => {
    setNameState(name);
  }, [name]);

  return (
    <div>
      <TextInput
        classNames={{
          input: S.nameInput,
          root: S.name,
        }}
        fw="bold"
        placeholder={namePlaceholder}
        rightSection={
          isNameHovered && !isNameFocused ? (
            <Flex className={S.rightSection}>
              <Icon name="pencil" size={12} />
            </Flex>
          ) : undefined
        }
        rightSectionPointerEvents="none"
        size="lg"
        value={nameState}
        onBlur={(event) => {
          setIsNameFocused(false);

          const newValue = event.target.value;

          // prevent empty names
          if (!newValue.trim()) {
            setNameState(name);
            return;
          }

          if (name !== newValue) {
            onNameChange(newValue);
          }
        }}
        onChange={(event) => setNameState(event.target.value)}
        onFocus={() => setIsNameFocused(true)}
        onMouseEnter={() => setIsNameHovered(true)}
        onMouseLeave={() => setIsNameHovered(false)}
      />

      <TextInput
        classNames={{
          input: S.descriptionInput,
          root: S.description,
        }}
        placeholder={descriptionPlaceholder}
        rightSection={
          isDescriptionHovered && !isDescriptionFocused ? (
            <Flex className={S.rightSection}>
              <Icon name="pencil" size={12} />
            </Flex>
          ) : undefined
        }
        rightSectionPointerEvents="none"
        value={descriptionState}
        onBlur={(event) => {
          setIsDescriptionFocused(false);

          const newValue = event.target.value;

          if (description !== newValue) {
            onDescriptionChange(newValue);
          }
        }}
        onChange={(event) => setDescriptionState(event.target.value)}
        onFocus={() => setIsDescriptionFocused(true)}
        onMouseEnter={() => setIsDescriptionHovered(true)}
        onMouseLeave={() => setIsDescriptionHovered(false)}
      />
    </div>
  );
};

import { useLayoutEffect, useState } from "react";

import { TextInput } from "metabase/ui";

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
        size="lg"
        value={nameState}
        onBlur={(event) => {
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
      />

      <TextInput
        classNames={{
          input: S.descriptionInput,
          root: S.description,
        }}
        placeholder={descriptionPlaceholder}
        value={descriptionState}
        onBlur={(event) => {
          const newValue = event.target.value;

          if (description !== newValue) {
            onDescriptionChange(newValue);
          }
        }}
        onChange={(event) => setDescriptionState(event.target.value)}
      />
    </div>
  );
};

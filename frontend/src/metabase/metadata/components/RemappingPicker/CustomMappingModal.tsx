import { type FormEvent, useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Modal, Text, TextInput } from "metabase/ui";

interface Props {
  isOpen: boolean;
  value: Map<number, string>; // TODO: does it need to be a Map?
  onChange: (value: Map<number, string>) => void;
  onClose: () => void;
}

export const CustomMappingModal = ({
  isOpen,
  value,
  onChange,
  onClose,
}: Props) => {
  const [remapping, setRemapping] = useState(value);

  useEffect(() => {
    setRemapping(value);
  }, [value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(remapping);
  };

  return (
    <Modal opened={isOpen} title={t`Custom mapping`} onClose={onClose}>
      <div>
        <Text component="span" fw="bold">{t`Tip: `}</Text>
        <Text component="span">{t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}</Text>
      </div>

      <form onSubmit={handleSubmit}>
        <Box component="table" mt="md" w="100%">
          <thead>
            <tr>
              <td>
                <Text fw="bold">{t`Original value`}</Text>
              </td>
              <td>
                <Text fw="bold">{t`Mapped value`}</Text>
              </td>
            </tr>
          </thead>

          <tbody>
            {[...remapping].map(([original, mapped], index) => (
              <tr key={index}>
                <td>{original}</td>
                <Box component="td" w="30%">
                  <TextInput
                    value={mapped}
                    onChange={(event) => {
                      setRemapping((remapping) => {
                        return new Map([
                          ...remapping,
                          [original, event.target.value],
                        ]);
                      });
                    }}
                  />
                </Box>
              </tr>
            ))}
          </tbody>
        </Box>

        <Group gap="md" justify="flex-end" mt="md">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button miw={128} type="submit" variant="primary">{t`Save`}</Button>
        </Group>
      </form>
    </Modal>
  );
};

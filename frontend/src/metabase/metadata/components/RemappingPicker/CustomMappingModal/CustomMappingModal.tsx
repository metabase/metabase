import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Button, Group, Modal, Text, TextInput } from "metabase/ui";

import type { Mapping } from "./types";
import { areMappingsEqual, fillMissingMappings } from "./utils";

interface Props {
  isOpen: boolean;
  value: Mapping;
  onChange: (value: Mapping) => void;
  onClose: () => void;
}

export const CustomMappingModal = ({
  isOpen,
  value,
  onChange,
  onClose,
}: Props) => {
  const [mapping, setMapping] = useState(new Map());
  const mappingRef = useLatest(mapping);
  const onChangeRef = useLatest(onChange);
  const hasEmptyCustomValues = useMemo(() => {
    return Array.from(mapping.values()).some((value) => {
      return value.trim().length === 0;
    });
  }, [mapping]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(mapping);
  };

  useEffect(() => {
    const newMapping = fillMissingMappings(value);
    const hasUnsetMappings = [...value.values()].some((mappedOrUndefined) => {
      return mappedOrUndefined === undefined;
    });

    if (!areMappingsEqual(mappingRef.current, newMapping)) {
      setMapping(newMapping);
    }

    if (hasUnsetMappings) {
      // Save the initial values to make sure that we aren't left in a potentially broken state where
      // the dimension type is "internal" but we don't have any values in metabase_fieldvalues
      onChangeRef.current(newMapping);
    }
  }, [onChangeRef, mappingRef, value]); // run this effect only when "value" changes

  return (
    <Modal opened={isOpen} title={t`Custom mapping`} onClose={onClose}>
      <Box>
        <Text component="span" fw="bold">{t`Tip: `}</Text>
        <Text component="span">{t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}</Text>
      </Box>

      <form onSubmit={handleSubmit}>
        <Box component="table" mt="md" w="100%">
          <thead>
            <tr>
              <td>
                <Text fw="bold">{t`Original value`}</Text>
              </td>
              <Box component="td" w="30%">
                <Text fw="bold">{t`Mapped value`}</Text>
              </Box>
            </tr>
          </thead>

          <tbody>
            {[...mapping].map(([original, mapped], index) => (
              <tr key={index}>
                <td>{original}</td>
                <td>
                  <TextInput
                    placeholder={t`Enter value`}
                    value={mapped}
                    onChange={(event) => {
                      setMapping((mapping) => {
                        return new Map([
                          ...mapping,
                          [original, event.target.value],
                        ]);
                      });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Box>

        <Group gap="md" justify="flex-end" mt="md">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            disabled={hasEmptyCustomValues}
            miw={128}
            type="submit"
            variant="primary"
          >{t`Save`}</Button>
        </Group>
      </form>
    </Modal>
  );
};

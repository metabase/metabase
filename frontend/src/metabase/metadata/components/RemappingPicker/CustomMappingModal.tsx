import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Button, Group, Modal, Text, TextInput } from "metabase/ui";

type Mappings = Map<number, string>; // TODO: move to types.ts?

interface Props {
  isOpen: boolean;
  value: Mappings; // TODO: does it need to be a Map?
  onChange: (value: Mappings) => void;
  onClose: () => void;
}

export const CustomMappingModal = ({
  isOpen,
  value,
  onChange,
  onClose,
}: Props) => {
  const [remapping, setRemapping] = useState(new Map());
  const remappingRef = useLatest(remapping);
  const onChangeRef = useLatest(onChange);
  const hasEmptyCustomValues = useMemo(() => {
    return Array.from(remapping.values()).some((value) => {
      return value.trim().length === 0;
    });
  }, [remapping]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(remapping);
  };

  useEffect(() => {
    const remapping = remappingRef.current;
    const newRemapping = fillMissingMappings(value);
    const hasUnsetMappings = [...value.values()].some((mappedOrUndefined) => {
      return mappedOrUndefined === undefined;
    });

    if (!areMappingsEqual(remapping, newRemapping)) {
      setRemapping(newRemapping);
    }

    if (hasUnsetMappings) {
      // Save the initial values to make sure that we aren't left in a potentially broken state where
      // the dimension type is "internal" but we don't have any values in metabase_fieldvalues
      onChangeRef.current(newRemapping);
    }
  }, [onChangeRef, remappingRef, value]); // run this effect only when "value" changes

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
            {[...remapping].map(([original, mapped], index) => (
              <tr key={index}>
                <td>{original}</td>
                <td>
                  <TextInput
                    placeholder={t`Enter value`}
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

function areMappingsEqual(a: Mappings, b: Mappings): boolean {
  return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
}

function fillMissingMappings(mappings: Mappings): Mappings {
  const remappings = new Map(
    [...mappings].map(([original, mappedOrUndefined]) => {
      // Use currently the original value as the "default custom mapping" as the current backend implementation
      // requires that all original values must have corresponding mappings

      // Additionally, the defensive `.toString` ensures that the mapped value definitely will be string
      const mappedString =
        mappedOrUndefined !== undefined
          ? mappedOrUndefined.toString()
          : original === null
            ? "null"
            : original.toString();

      return [original, mappedString];
    }),
  );

  return remappings;
}

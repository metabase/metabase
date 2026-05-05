import { type FormEvent, useLayoutEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Button, Group, Modal, Text, TextInput } from "metabase/ui";

import S from "./CustomMappingModal.module.css";
import type { ChangeOptions, Mapping } from "./types";
import {
  areMappingsEqual,
  fillMissingMappings,
  getHasEmptyValues,
} from "./utils";

interface Props {
  isOpen: boolean;
  value: Mapping;
  onChange: (value: Mapping, options?: ChangeOptions) => void;
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
  const hasEmptyValues = useMemo(() => getHasEmptyValues(mapping), [mapping]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(mapping);
    onClose();
  };

  const handleClose = () => {
    const currentMapping = fillMissingMappings(value);

    // reset state when cancelling
    if (!areMappingsEqual(mappingRef.current, currentMapping)) {
      setMapping(currentMapping);
    }

    onClose();
  };

  useLayoutEffect(() => {
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
      onChangeRef.current(newMapping, { isAutomatic: true });
    }
  }, [onChangeRef, mappingRef, value]); // run this effect only when "value" prop changes

  return (
    <Modal.Root opened={isOpen} onClose={handleClose}>
      <Modal.Overlay />

      <Modal.Content mah="75vh">
        <Modal.Header pb="md" pt="lg" px="xl">
          <Modal.Title>{t`Custom mapping`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>

        <Modal.Body p={0}>
          <Box px="xl">
            <Text component="span" fw="bold">{t`Tip: `}</Text>
            <Text component="span">{t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}</Text>
          </Box>

          <form onSubmit={handleSubmit}>
            <Box className={S.table} component="table" mt="md" w="100%">
              <thead>
                <tr>
                  <Box className={S.headerCell} component="td" p="md" pl="xl">
                    <Text fw="bold">{t`Original value`}</Text>
                  </Box>

                  <Box
                    className={S.headerCell}
                    component="td"
                    p="md"
                    pr="xl"
                    w="30%"
                  >
                    <Text fw="bold">{t`Mapped value`}</Text>
                  </Box>
                </tr>
              </thead>

              <tbody>
                {[...mapping].map(([original, mapped], index) => (
                  <Box
                    bg={index % 2 === 1 ? "accent-gray-light" : undefined}
                    component="tr"
                    key={index}
                  >
                    <Box component="td" p="sm" pl="xl">
                      {original}
                    </Box>

                    <Box component="td" p="sm" pr="xl">
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
                    </Box>
                  </Box>
                ))}
              </tbody>
            </Box>

            <Group
              bg="background-primary"
              bottom={0}
              className={S.footer}
              gap="md"
              justify="flex-end"
              px="xl"
              py="lg"
              pos="sticky"
            >
              <Button onClick={handleClose}>{t`Cancel`}</Button>

              <Button
                disabled={hasEmptyValues}
                miw={128}
                type="submit"
                variant="primary"
              >{t`Save`}</Button>
            </Group>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

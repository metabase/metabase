import { t } from "ttag";
import { Button, Flex, NumberInput, Popover, Stack } from "metabase/ui";
import { useToggle } from "metabase/hooks/use-toggle";

// https://v6.mantine.dev/core/modal/?t=props
const MODAL_Z_INDEX = 200;

type NumberValue = number | "";

interface InsideFilterPopoverProps {
  values: NumberValue[];
  onChange: (values: NumberValue[]) => void;
}

export function InsideFilterPopover({
  values,
  onChange,
}: InsideFilterPopoverProps) {
  const [isOpen, { turnOn: handleOpen, turnOff: handleClose }] =
    useToggle(false);

  const [upperLatitude, leftLongitude, lowerLatitude, rightLongitude] = values;

  const handleUpperLatitudeChange = (newValue: number) => {
    onChange([newValue, leftLongitude, lowerLatitude, rightLongitude]);
  };

  const handleLeftLongitudeChange = (newValue: number) => {
    onChange([upperLatitude, newValue, lowerLatitude, rightLongitude]);
  };

  const handleLowerLatitudeChange = (newValue: number) => {
    onChange([upperLatitude, leftLongitude, newValue, rightLongitude]);
  };

  const handleRightLongitudeChange = (newValue: number) => {
    onChange([upperLatitude, leftLongitude, lowerLatitude, newValue]);
  };

  return (
    <Popover opened={isOpen} zIndex={MODAL_Z_INDEX + 1} onClose={handleClose}>
      <Popover.Target>
        <Button onClick={handleOpen}>{t`Inside`}</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack>
          <Stack align="center" justify="center" spacing="sm" p="md">
            <NumberInput
              label={t`Upper latitude`}
              value={upperLatitude}
              onChange={handleUpperLatitudeChange}
              placeholder="90"
              autoFocus
            />
            <Flex align="center" justify="center" gap="sm">
              <NumberInput
                label={t`Left longitude`}
                value={leftLongitude}
                onChange={handleLeftLongitudeChange}
                placeholder="-180"
              />
              <NumberInput
                label={t`Right longitude`}
                value={rightLongitude}
                onChange={handleRightLongitudeChange}
                placeholder="180"
              />
            </Flex>
            <NumberInput
              label={t`Lower latitude`}
              value={lowerLatitude}
              onChange={handleLowerLatitudeChange}
              placeholder="-90"
            />
          </Stack>
          <Flex
            justify="flex-end"
            p="sm"
            w="100%"
            style={{ borderTop: "1px solid #EEECEC" }}
          >
            <Button
              variant="filled"
              onClick={handleClose}
            >{t`Add filter`}</Button>
          </Flex>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

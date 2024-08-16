import { t } from "ttag";
import { Modal, Flex, Text, Input, Textarea } from "metabase/ui";
import { ENTITY_PICKER_Z_INDEX } from "metabase/common/components/EntityPicker";
import { CubeResult } from "metabase/browse/components/CubeTable";

interface CubeInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cube: CubeResult;
}

export const CubeDialog = ({
  isOpen,
  onClose,
  cube,
}: CubeInfoDialogProps) => {
  const isLongDescription = cube.description.length >= 62;

  return (
    <Modal
      title={t`Definition Details`}
      opened={isOpen}
      onClose={onClose}
      data-testid="cube-info-dialog"
      trapFocus={true}
      withCloseButton={true}
      zIndex={ENTITY_PICKER_Z_INDEX}
    >
      <Flex direction="column" gap="md">
        <Flex direction="column">
          <Text weight="bold">{t`Name`}</Text>
          {/* <Text>{cube.title}</Text> */}
          <Input value={cube.title} readOnly>
          </Input>
        </Flex>
        <Flex direction="column">
          <Flex direction="row" justify="space-between">
          <Flex direction="column">
              <Text weight="bold">{t`Key`}</Text>
              <Text>{cube.primaryKey ? "Unique Key" : "Non-Unique Key"}</Text>
            </Flex>
            <Flex direction="column">
              <Text weight="bold">{t`Category`}</Text>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{cube.category}</Text>
            </Flex>
            <Flex direction="column">
              <Text weight="bold">{t`Type`}</Text>
              <Text>{cube.type}</Text>
            </Flex>
          </Flex>
        </Flex>
        <Flex direction="column">
          <Text weight="bold">{t`Description`}</Text>
          {/* <Text style={{ whiteSpace: 'pre-wrap' }}>{cube.description}</Text> */}
          {!isLongDescription ? (
            <Input value={cube.description} readOnly></Input>
          ) : (
          <Textarea value={cube.description} readOnly></Textarea>
          )}
        </Flex>
        <Flex direction="column">
          <Text weight="bold">{t`SQL`}</Text>

            <Input value={cube.sql} readOnly></Input>

        </Flex>
      </Flex>
    </Modal>
  );
};

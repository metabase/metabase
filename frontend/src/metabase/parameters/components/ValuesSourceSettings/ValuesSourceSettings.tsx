import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Modal, Radio, Stack, Tooltip } from "metabase/ui";
import { getQueryType } from "metabase-lib/v1/parameters/utils/parameter-source";
import type {
  Parameter,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";

import ValuesSourceModal from "../ValuesSourceModal";

interface ValuesSourceSettingsProps {
  parameter: Parameter;
  onChangeQueryType: (queryType: ValuesQueryType) => void;
  onChangeSourceSettings: (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => void;
}

export function ValuesSourceSettings({
  parameter,
  onChangeQueryType,
  onChangeSourceSettings,
}: ValuesSourceSettingsProps) {
  const queryType = getQueryType(parameter);
  const [isModalOpened, setIsModalOpened] = useState(false);

  // linked filters only work with connected field sources (metabase#33892)
  const disableEdit = hasLinkedFilters(parameter);
  const openModal = () => setIsModalOpened(true);
  const closeModal = () => setIsModalOpened(false);

  return (
    <>
      <Radio.Group
        value={queryType}
        onChange={(newValue: string) =>
          onChangeQueryType(newValue as ValuesQueryType)
        }
      >
        <Stack gap="xs">
          <RadioContainer
            ownValue="list"
            selectedValue={queryType}
            label={t`Dropdown list`}
            disableEdit={disableEdit}
            onEditClick={openModal}
          />
          <RadioContainer
            ownValue="search"
            selectedValue={queryType}
            label={t`Search box`}
            disableEdit={disableEdit}
            onEditClick={openModal}
          />
          <RadioContainer
            ownValue="none"
            selectedValue={queryType}
            label={t`Input box`}
            hideEdit
          />
        </Stack>
      </Radio.Group>
      <Modal
        opened={isModalOpened}
        onClose={closeModal}
        size="65%"
        padding={0}
        withCloseButton={false}
      >
        <ValuesSourceModal
          parameter={parameter}
          onSubmit={onChangeSourceSettings}
          onClose={closeModal}
        />
      </Modal>
    </>
  );
}

function hasLinkedFilters({ filteringParameters }: Parameter) {
  return filteringParameters != null && filteringParameters.length > 0;
}

function RadioContainer({
  selectedValue,
  ownValue,
  label,
  disableEdit = false,
  hideEdit = false,
  onEditClick,
}: {
  selectedValue: ValuesQueryType;
  ownValue: ValuesQueryType;
  label: string;
  disableEdit?: boolean;
  hideEdit?: boolean;
  onEditClick?: () => void;
}) {
  const isChecked = selectedValue === ownValue;
  return (
    <Flex justify="space-between">
      <Radio checked={isChecked} label={label} value={ownValue} />
      {isChecked && !hideEdit && (
        <Tooltip
          label={t`You can’t customize selectable values for this filter because it is linked to another one.`}
          position="top"
          disabled={!disableEdit}
        >
          {/* This div is needed to make the tooltip work when the button is disabled */}
          <div data-testid="values-source-settings-edit-btn">
            <Button
              onClick={onEditClick}
              disabled={disableEdit}
              variant="subtle"
              p={0}
              size="compact-md"
              h="100%"
            >
              <Box
                component="span"
                display="inline-block"
                p="0 5px"
              >{t`Edit`}</Box>
            </Button>
          </div>
        </Tooltip>
      )}
    </Flex>
  );
}

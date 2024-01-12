import { useCallback, useState } from "react";
import { t } from "ttag";
// import DeprecatedRadio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import Tooltip from "metabase/core/components/Tooltip";
import { Radio, Button, Flex, Stack } from "metabase/ui";
import type {
  Parameter,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { getQueryType } from "metabase-lib/parameters/utils/parameter-source";
import ValuesSourceModal from "../ValuesSourceModal";
// import { RadioLabelRoot, RadioLabelTitle } from "./ValuesSourceSettings.styled";

export interface ValuesSourceSettingsProps {
  parameter: Parameter;
  onChangeQueryType: (queryType: ValuesQueryType) => void;
  onChangeSourceSettings: (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => void;
}

export const ValuesSourceSettings = ({
  parameter,
  onChangeQueryType,
  onChangeSourceSettings,
}: ValuesSourceSettingsProps): JSX.Element => {
  const queryType = getQueryType(parameter);
  const [isModalOpened, setIsModalOpened] = useState(false);

  // linked filters only work with connected field sources (metabase#33892)
  const disableEdit = hasLinkedFilters(parameter);
  const onEditClick = () => setIsModalOpened(true);

  // const radioOptions = useMemo(() => {
  //   return getRadioOptions({
  //     queryType,
  //     onEditClick: () => setIsModalOpened(true),
  //     // linked filters only work with connected field sources (metabase#33892)
  //     isEditDisabled: hasLinkedFilters(parameter),
  //   });
  // }, [queryType, parameter]);

  const handleModalClose = useCallback(() => setIsModalOpened(false), []);

  return (
    <>
      <Radio.Group value={queryType} onChange={onChangeQueryType}>
        <Stack spacing="xs">
          <RadioLine
            ownValue="list"
            selectedValue={queryType}
            label={t`Dropdown list`}
            disableEdit={disableEdit}
            onEditClick={onEditClick}
          />

          <RadioLine
            ownValue="search"
            selectedValue={queryType}
            label={t`Search box`}
            disableEdit={disableEdit}
            onEditClick={onEditClick}
          />

          <RadioLine
            ownValue="none"
            selectedValue={queryType}
            label={t`Input box`}
            hideEdit
            onEditClick={onEditClick}
          />
        </Stack>
      </Radio.Group>
      {/* <DeprecatedRadio
        value={queryType}
        options={radioOptions}
        vertical
        onChange={onChangeQueryType}
      /> */}
      {isModalOpened && (
        <Modal medium onClose={handleModalClose}>
          <ValuesSourceModal
            parameter={parameter}
            onSubmit={onChangeSourceSettings}
            onClose={handleModalClose}
          />
        </Modal>
      )}
    </>
  );
};

function hasLinkedFilters({ filteringParameters }: Parameter) {
  return filteringParameters != null && filteringParameters.length > 0;
}

interface RadioLineProps {
  selectedValue: ValuesQueryType;
  ownValue: ValuesQueryType;
  label: string;
  disableEdit?: boolean; // make edit disabled
  hideEdit?: boolean; // don't show at all
  onEditClick?: () => void;
}

function RadioLine({
  selectedValue,
  ownValue,
  label,
  disableEdit = false,
  hideEdit = false,
  onEditClick,
}: RadioLineProps) {
  const isChecked = selectedValue === ownValue;
  return (
    <Flex justify="space-between">
      <Radio checked={isChecked} label={label} value={ownValue} />
      {isChecked && !hideEdit && (
        <Tooltip
          tooltip={t`You can’t customize selectable values for this filter because it is linked to another one.`}
          placement="top"
          isEnabled={disableEdit}
        >
          {/* This div is needed to make the tooltip work when the button is disabled */}
          <div data-testid="values-source-settings-edit-btn">
            <Button
              onClick={onEditClick}
              disabled={disableEdit}
              variant="subtle"
              p={0}
              compact={true}
            >
              {t`Edit`}
            </Button>
          </div>
        </Tooltip>
      )}
    </Flex>
  );
}

// interface RadioLabelProps {
//   title: string;
//   isSelected?: boolean;
//   onEditClick?: () => void;
//   isEditDisabled?: boolean;
// }

// const RadioLabel = ({
//   title,
//   isSelected,
//   onEditClick,
//   isEditDisabled = false,
// }: RadioLabelProps): JSX.Element => {
//   return (
//     <RadioLabelRoot>
//       <RadioLabelTitle>{title}</RadioLabelTitle>
//       {isSelected && (
//         <Tooltip
//           tooltip={t`You can’t customize selectable values for this filter because it is linked to another one.`}
//           placement="top"
//           isEnabled={isEditDisabled}
//         >
//           {/* This div is needed to make the tooltip work when the button is disabled */}
//           <div data-testid="values-source-settings-edit-btn">
//             <Button
//               onClick={onEditClick}
//               disabled={isEditDisabled}
//               variant="subtle"
//               p={0}
//               compact={true}
//             >
//               {t`Edit`}
//             </Button>
//           </div>
//         </Tooltip>
//       )}
//     </RadioLabelRoot>
//   );
// };

// const getRadioOptions = ({
//   queryType,
//   onEditClick,
//   isEditDisabled,
// }: {
//   queryType: ValuesQueryType;
//   onEditClick: () => void;
//   isEditDisabled: boolean;
// }) => {
//   return [
//     {
//       name: (
//         <RadioLabel
//           title={t`Dropdown list`}
//           isSelected={queryType === "list"}
//           onEditClick={onEditClick}
//           isEditDisabled={isEditDisabled}
//         />
//       ),
//       value: "list",
//     },
//     {
//       name: (
//         <RadioLabel
//           title={t`Search box`}
//           isSelected={queryType === "search"}
//           onEditClick={onEditClick}
//           isEditDisabled={isEditDisabled}
//         />
//       ),
//       value: "search",
//     },
//     {
//       name: <RadioLabel title={t`Input box`} />,
//       value: "none",
//     },
//   ];
// };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ValuesSourceSettings;

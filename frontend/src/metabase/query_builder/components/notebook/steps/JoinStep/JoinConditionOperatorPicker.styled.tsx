import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import SelectList from "metabase/components/SelectList";

export const OperatorPickerButton = styled(Button)`
  width: 36px;
  height: 36px;
  font-size: 16px;
  padding: 0;
`;

OperatorPickerButton.defaultProps = { primary: true };

export const OperatorList = styled(SelectList)`
  width: 80px;
  padding: 0.5rem;
`;

export const OperatorListItem = styled(SelectList.Item)`
  padding: 0.5rem 0.5rem 0.5rem 1rem;
`;

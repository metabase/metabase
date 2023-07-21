import { useCallback, useState } from "react";
import type { RegularClickAction } from "metabase/modes/types";
import { Container, Divider } from "./ChartClickActions.styled";
import {
  getGroupedAndSortedActions,
  getSectionContentDirection,
  getSectionTitle,
} from "./utils";
import { ChartClickActionsSection } from "./ChartClickActionsSection";
import { ChartClickActionControl } from "./ChartClickActionControl";

interface Props {
  clickActions: RegularClickAction[];
  clicked: any;

  handleEditValue: (value: string) => void;
  onClick: (action: RegularClickAction) => void;
}

export const ChartClickActionsView = ({
  clickActions,
  onClick,
  handleEditValue,
  clicked,
}: Props): JSX.Element => {
  const sections = getGroupedAndSortedActions(clickActions);
  
  
  // add state for editing value 
  const [value, setValue] = useState(clicked.value ?? "");
  
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, [setValue]);

  const hasOnlyOneSection = sections.length === 1;

  return (
    <Container>
      <button style={{ backgroundColor: "yellow" }} onClick={() => handleEditValue(value)}>Edit Value</button>
      <input onChange={handleChange} value={value}></input>
      {sections.map(([key, actions]) => {
        const sectionTitle = getSectionTitle(key, actions);
        const contentDirection = getSectionContentDirection(key, actions);
        const withBottomDivider = key === "records" && !hasOnlyOneSection;
        const withTopDivider = key === "details" && !hasOnlyOneSection;

        return (
          <ChartClickActionsSection
            key={key}
            type={key}
            title={sectionTitle}
            contentDirection={contentDirection}
          >
            {withTopDivider && <Divider />}
            {actions.map((action, index) => (
              <ChartClickActionControl
                key={action.name}
                action={action}
                onClick={() => onClick(action)}
              />
            ))}
            {withBottomDivider && <Divider />}
          </ChartClickActionsSection>
        );
      })}
    </Container>
  );
};

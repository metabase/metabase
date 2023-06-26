import {
  ToggleButton,
  ToggleColorRange,
  ToggleRoot,
} from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
  value: string[];
  isQuantile?: boolean;
  onClick?: () => void;
}

const ColorRangeToggle = ({
  value,
  isQuantile,
  onClick,
}: ColorRangeToggleProps) => {
  return (
    <ToggleRoot>
      <ToggleColorRange colors={value} isQuantile={isQuantile} />
      <ToggleButton icon="compare" small onClick={onClick} />
    </ToggleRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorRangeToggle;

import { forwardRef } from "react";
import { AggregationName, RemoveIcon, Root } from "./AggregationItem.styled";

interface AggregationItemProps {
  name: string;
  onClick: () => void;
  onRemove: () => void;
}

export const AggregationItem = forwardRef<
  HTMLButtonElement,
  AggregationItemProps
>(function AggregationItem({ name, onClick, onRemove }, ref) {
  return (
    <Root
      aria-label={name}
      onClick={onClick}
      data-testid="aggregation-item"
      ref={ref}
    >
      <AggregationName>{name}</AggregationName>
      <RemoveIcon name="close" onClick={onRemove} />
    </Root>
  );
});

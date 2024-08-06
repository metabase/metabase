import _ from "underscore";

import type Filter from "metabase-lib/v1/queries/structured/Filter";

import type { DateOperator } from "./DatePicker";
import { DATE_OPERATORS } from "./DatePicker";
import { Container, BackButton, TabButton } from "./DatePickerHeader.styled";
import { getHeaderText } from "./ExcludeDatePicker";

type Props = {
  className?: string;
  isSidebar?: boolean;

  filter: Filter;
  operators?: DateOperator[];
  onBack?: () => void;
  onFilterChange: (filter: any[]) => void;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function DatePickerHeader({
  operators = DATE_OPERATORS,
  filter,
  onFilterChange,
  onBack,
}: Props) {
  const [_op, _field] = filter;
  const dimension = filter.dimension?.();
  const operator = _.find(operators, o => o.test(filter));
  const tabs = operators.filter(o => o.group === operator?.group);

  if (operator?.name === "exclude") {
    const hasTemporalUnit = dimension?.temporalUnit();
    return onBack || hasTemporalUnit ? (
      <Container>
        <BackButton
          onClick={() => {
            if (hasTemporalUnit) {
              onFilterChange([
                "!=",
                dimension?.withoutTemporalBucketing().mbql(),
              ]);
            } else {
              onBack?.();
            }
          }}
          icon="chevronleft"
        >
          {getHeaderText(filter)}
        </BackButton>
      </Container>
    ) : null;
  }

  return (
    <Container>
      {onBack ? <BackButton onClick={onBack} icon="chevronleft" /> : null}
      {tabs.map(({ test, displayName, init }) => (
        <TabButton
          selected={!!test(filter)}
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </TabButton>
      ))}
    </Container>
  );
}

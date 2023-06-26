import _ from "underscore";

import Filter from "metabase-lib/queries/structured/Filter";
import { Container, BackButton, TabButton } from "./DatePickerHeader.styled";
import { DateOperator, DATE_OPERATORS } from "./DatePicker";
import { getHeaderText } from "./ExcludeDatePicker";

type Props = {
  className?: string;
  isSidebar?: boolean;
  primaryColor?: string;

  filter: Filter;
  operators?: DateOperator[];
  onBack?: () => void;
  onFilterChange: (filter: any[]) => void;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function DatePickerHeader({
  operators = DATE_OPERATORS,
  filter,
  primaryColor,
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
          primaryColor={primaryColor}
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
      {onBack ? (
        <BackButton
          primaryColor={primaryColor}
          onClick={onBack}
          icon="chevronleft"
        />
      ) : null}
      {tabs.map(({ test, displayName, init }) => (
        <TabButton
          selected={!!test(filter)}
          primaryColor={primaryColor}
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

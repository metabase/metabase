import { useState } from "react";
import { t } from "ttag";
import { Divider } from "metabase/ui";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";
import ExcludeDatePicker, {
  EXCLUDE_OPERATORS,
} from "metabase/admin/datamodel/components/filters/pickers/DatePicker/ExcludeDatePicker";
import DatePickerHeader from "metabase/admin/datamodel/components/filters/pickers/DatePicker/DatePickerHeader";
import {
  WidgetRoot,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";
import { Container } from "./DateExcludeWidget.styled";

interface DateExcludeWidgetProps {
  onClose: () => void;
  setValue: (value: string | null) => void;
  value?: string | null;
}

export function DateExcludeWidget({
  onClose,
  setValue,
  value,
}: DateExcludeWidgetProps) {
  const initial = ["!=", ["field", null, {}]];
  const [filter, setFilter] = useState(
    dateParameterValueToMBQL(value, null) || initial,
  );

  const filterSelected = EXCLUDE_OPERATORS.some(({ test }) => test(filter));
  const commitAndClose = (newFilter?: any) => {
    setValue(filterToUrlEncoded(newFilter || filter));
    onClose?.();
  };

  return (
    <WidgetRoot>
      {filterSelected ? (
        <DatePickerHeader
          filter={filter}
          onBack={() => {
            setFilter(initial);
          }}
          onFilterChange={setFilter}
        />
      ) : (
        <Container>
          <h4>{t`Exclude…`}</h4>
        </Container>
      )}
      <ExcludeDatePicker
        className="flex-full p2"
        onFilterChange={setFilter}
        filter={filter}
        onCommit={commitAndClose}
        hideEmptinessOperators
      />
      {filterSelected ? (
        <Container>
          <Divider mx="md" my="sm" />
          <UpdateButton onClick={() => commitAndClose()}>
            {t`Update filter`}
          </UpdateButton>
        </Container>
      ) : null}
    </WidgetRoot>
  );
}

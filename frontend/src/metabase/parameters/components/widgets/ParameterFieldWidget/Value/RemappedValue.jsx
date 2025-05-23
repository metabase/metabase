/* eslint-disable react/prop-types */
import CS from "metabase/css/core/index.css";
import AutoLoadRemapped from "metabase/hoc/Remapped";
import { useTranslateContent } from "metabase/i18n/hooks";
import { formatValue } from "metabase/lib/formatting";

const defaultRenderNormal = ({ value }) => <span>{value}</span>;

const defaultRenderRemapped = ({ value, displayValue, column }) => (
  <span>
    <span className={CS.textBold}>{displayValue}</span>
    {/* Show the underlying ID for PK/FK */}
    {column?.isID() && <span style={{ opacity: 0.5 }}>{" - " + value}</span>}
  </span>
);

const RemappedValueContent = ({
  value,
  column,
  displayValue,
  displayColumn,
  renderNormal = defaultRenderNormal,
  renderRemapped = defaultRenderRemapped,
  ...props
}) => {
  const tc = useTranslateContent();
  if (column != null) {
    value = formatValue(value, {
      ...props,
      column: column,
      jsx: true,
      remap: false,
    });
  }

  if (displayColumn != null) {
    displayValue = formatValue(displayValue, {
      ...props,
      column: displayColumn,
      jsx: true,
      remap: false,
    });
  }

  const maybeTranslatedValue = tc(value);
  const maybeTranslatedDisplayValue = tc(displayValue);

  if (displayValue != null) {
    return renderRemapped({
      value: maybeTranslatedValue,
      displayValue: maybeTranslatedDisplayValue,
      column,
      displayColumn,
    });
  } else {
    return renderNormal({ value: maybeTranslatedValue, column });
  }
};

export const AutoLoadRemappedValue = AutoLoadRemapped(RemappedValueContent);

export const FieldRemappedValue = (props) => (
  <RemappedValueContent
    {...props}
    displayValue={props.displayValue ?? props.column.remappedValue(props.value)}
  />
);

const RemappedValue = ({ autoLoad = true, ...props }) =>
  autoLoad && !props.displayValue ? (
    <AutoLoadRemappedValue {...props} />
  ) : (
    <FieldRemappedValue {...props} />
  );

export default RemappedValue;

// test version doesn't use metabase/hoc/Remapped which requires a redux store
export const TestRemappedValue = RemappedValueContent;

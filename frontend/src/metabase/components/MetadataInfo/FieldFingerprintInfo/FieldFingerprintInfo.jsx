import PropTypes from "prop-types";
import { t } from "ttag";

import { formatDateTimeWithUnit, formatNumber } from "metabase/lib/formatting";
import Field from "metabase-lib/metadata/Field";

import { Table } from "../MetadataInfo.styled";
import CategoryFingerprint from "./CategoryFingerprint";

const propTypes = {
  className: PropTypes.string,
  field: PropTypes.instanceOf(Field),
  showAllFieldValues: PropTypes.bool,
};

function FieldFingerprintInfo({ className, field, showAllFieldValues }) {
  if (!field?.fingerprint) {
    return null;
  }

  if (field.isDate()) {
    return <DateTimeFingerprint className={className} field={field} />;
  } else if (field.isNumber() && !field.isID()) {
    return <NumberFingerprint className={className} field={field} />;
  } else if (field.isCategory()) {
    return (
      <CategoryFingerprint
        className={className}
        field={field}
        showAllFieldValues={showAllFieldValues}
      />
    );
  } else {
    return null;
  }
}

function getTimezone(field) {
  return field.query?.database?.()?.timezone || field.table?.database?.timezone;
}

function DateTimeFingerprint({ className, field }) {
  const dateTimeFingerprint = field.fingerprint.type?.["type/DateTime"];
  if (!dateTimeFingerprint) {
    return null;
  }

  const timezone = getTimezone(field);
  const { earliest, latest } = dateTimeFingerprint;
  const formattedEarliest = formatDateTimeWithUnit(earliest, "minute");
  const formattedLatest = formatDateTimeWithUnit(latest, "minute");

  return (
    <Table className={className}>
      <tbody>
        <tr>
          <th>{t`Timezone`}</th>
          <td>{timezone}</td>
        </tr>
        <tr>
          <th>{t`Earliest date`}</th>
          <td>{formattedEarliest}</td>
        </tr>
        <tr>
          <th>{t`Latest date`}</th>
          <td>{formattedLatest}</td>
        </tr>
      </tbody>
    </Table>
  );
}

/**
 * @param {(number|null|undefined)} num - a number value from the type/Number fingerprint; might not be a number
 * @returns {[boolean, string]} - a tuple, [isFormattedNumber, formattedNumber]
 */
function roundNumber(num) {
  if (num == null) {
    return [false, ""];
  }

  return [true, formatNumber(Number.isInteger(num) ? num : num.toFixed(2))];
}

function NumberFingerprint({ className, field }) {
  const numberFingerprint = field.fingerprint.type?.["type/Number"];
  if (!numberFingerprint) {
    return null;
  }

  const { avg, min, max } = numberFingerprint;
  const [isAvgNumber, formattedAvg] = roundNumber(avg);
  const [isMinNumber, formattedMin] = roundNumber(min);
  const [isMaxNumber, formattedMax] = roundNumber(max);

  const someNumberIsDefined = isAvgNumber || isMinNumber || isMaxNumber;

  return someNumberIsDefined ? (
    <Table className={className}>
      <thead>
        <tr>
          {isAvgNumber && <th>{t`Average`}</th>}
          {isMinNumber && <th>{t`Min`}</th>}
          {isMaxNumber && <th>{t`Max`}</th>}
        </tr>
      </thead>
      <tbody>
        <tr>
          {isAvgNumber && <td>{formattedAvg}</td>}
          {isMinNumber && <td>{formattedMin}</td>}
          {isMaxNumber && <td>{formattedMax}</td>}
        </tr>
      </tbody>
    </Table>
  ) : null;
}

FieldFingerprintInfo.propTypes = propTypes;
DateTimeFingerprint.propTypes = propTypes;
NumberFingerprint.propTypes = propTypes;

export default FieldFingerprintInfo;

import React from "react";
import PropTypes from "prop-types";
import { t, ngettext, msgid } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Field from "metabase-lib/lib/metadata/Field";

import FieldValuesList from "./FieldValuesList";

const propTypes = {
  field: PropTypes.instanceOf(Field),
};

function FieldFingerprintInfo({ field }) {
  if (!field?.fingerprint) {
    return null;
  }

  if (field.isDate()) {
    return <DateTimeFingerprint field={field} />;
  } else if (field.isNumber()) {
    return <NumberFingerprint field={field} />;
  } else if (field.isCategory()) {
    return <CategoryFingerprint field={field} />;
  } else {
    return null;
  }
}

function DateTimeFingerprint({ field }) {
  const dateTimeFingerprint = field.fingerprint.type["type/DateTime"];
  if (!dateTimeFingerprint) {
    return null;
  }

  const timezone = field?.table?.database?.timezone;
  const { earliest, latest } = dateTimeFingerprint;
  const formattedEarliest = formatDateTimeWithUnit(earliest, "minute");
  const formattedLatest = formatDateTimeWithUnit(latest, "minute");

  return (
    <table>
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
    </table>
  );
}

function NumberFingerprint({ field }) {
  const numberFingerprint = field.fingerprint.type["type/Number"];
  if (!numberFingerprint) {
    return null;
  }

  const { avg, min, max } = numberFingerprint;
  const fixedAvg = Number.isInteger(avg) ? avg : avg.toFixed(2);
  const fixedMin = Number.isInteger(min) ? min : min.toFixed(2);
  const fixedMax = Number.isInteger(max) ? max : max.toFixed(2);

  return (
    <table>
      <thead>
        <tr>
          <th>{t`Average`}</th>
          <th>{t`Min`}</th>
          <th>{t`Max`}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{fixedAvg}</td>
          <td>{fixedMin}</td>
          <td>{fixedMax}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CategoryFingerprint({ field }) {
  const distinctCount = field.fingerprint.global?.["distinct-count"];
  if (distinctCount == null) {
    return null;
  }

  return (
    <div>
      <div>
        {ngettext(
          msgid`${distinctCount} distinct value`,
          `${distinctCount} distinct values`,
          distinctCount,
        )}
      </div>
      <FieldValuesList field={field} />
    </div>
  );
}

FieldFingerprintInfo.propTypes = propTypes;
DateTimeFingerprint.propTypes = propTypes;
NumberFingerprint.propTypes = propTypes;
CategoryFingerprint.propTypes = propTypes;

export default FieldFingerprintInfo;

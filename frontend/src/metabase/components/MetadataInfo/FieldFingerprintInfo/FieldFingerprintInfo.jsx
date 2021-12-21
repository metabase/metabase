import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { formatDateTimeWithUnit, formatNumber } from "metabase/lib/formatting";
import Field from "metabase-lib/lib/metadata/Field";

import { Table } from "../MetadataInfo.styled";
import CategoryFingerprint from "./CategoryFingerprint";

const propTypes = {
  className: PropTypes.string,
  field: PropTypes.instanceOf(Field),
};

function FieldFingerprintInfo({ className, field }) {
  if (!field?.fingerprint) {
    return null;
  }

  if (field.isDate()) {
    return <DateTimeFingerprint className={className} field={field} />;
  } else if (field.isNumber()) {
    return <NumberFingerprint className={className} field={field} />;
  } else if (field.isCategory()) {
    return <CategoryFingerprint className={className} field={field} />;
  } else {
    return null;
  }
}

function getTimezone(field) {
  return field.query?.database?.()?.timezone || field.table?.database?.timezone;
}

function DateTimeFingerprint({ className, field }) {
  const dateTimeFingerprint = field.fingerprint.type["type/DateTime"];
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

function NumberFingerprint({ className, field }) {
  const numberFingerprint = field.fingerprint.type["type/Number"];
  if (!numberFingerprint) {
    return null;
  }

  const { avg, min, max } = numberFingerprint;
  const fixedAvg = formatNumber(Number.isInteger(avg) ? avg : avg.toFixed(2));
  const fixedMin = formatNumber(Number.isInteger(min) ? min : min.toFixed(2));
  const fixedMax = formatNumber(Number.isInteger(max) ? max : max.toFixed(2));

  return (
    <Table className={className}>
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
    </Table>
  );
}

FieldFingerprintInfo.propTypes = propTypes;
DateTimeFingerprint.propTypes = propTypes;
NumberFingerprint.propTypes = propTypes;

export default FieldFingerprintInfo;

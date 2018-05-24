/* @flow */

import { t, ngettext, msgid } from "c-3po";
// NOTE: extending Error with Babel requires babel-plugin-transform-builtin-extend

export class MinColumnsError extends Error {
  constructor(minColumns: number, actualColumns: number) {
    super(
      t`Doh! The data from your query doesn't fit the chosen display choice. This visualization requires at least ${actualColumns} ${ngettext(
        msgid`column`,
        `columns`,
        actualColumns,
      )} of data.`,
    );
  }
}

export class MinRowsError extends Error {
  constructor(minRows: number, actualRows: number) {
    super(
      t`No dice. We have ${actualRows} data ${ngettext(
        msgid`point`,
        `points`,
        actualRows,
      )} to show and that's not enough for this visualization.`,
    );
  }
}

export class LatitudeLongitudeError extends Error {
  constructor() {
    super(
      t`Bummer. We can't actually do a pin map for this data because we require both a latitude and longitude column.`,
    );
  }
}

export class ChartSettingsError extends Error {
  section: ?string;
  buttonText: ?string;
  constructor(message: string, section?: string, buttonText?: string) {
    super(message || t`Please configure this chart in the chart settings`);
    this.section = section;
    this.buttonText = buttonText || t`Edit Settings`;
  }
}

import moment from "moment";

// only attempt to parse the timezone if we're sure we have one (either Z or ±hh:mm or +-hhmm)
// moment normally interprets the DD in YYYY-MM-DD as an offset :-/
export function parseTimestamp(value, unit) {
    if (moment.isMoment(value)) {
        return value;
    } else if (typeof value === "string" && /(Z|[+-]\d\d:?\d\d)$/.test(value)) {
        return moment.parseZone(value);
    } else if (unit === "year") {
        // workaround for https://github.com/metabase/metabase/issues/1992
        return moment().year(value).startOf("year");
    } else {
        return moment.utc(value);
    }
}

import getUnicodeFlagIcon from "country-flag-icons/unicode";
import { Facebook, Twitter, Search, Mail } from "react-feather";
import { Icon } from "metabase/ui";

export const defaultRenderer = (row: Row) => {
  return <div>{String(row.row[row.column.idx])}</div>;
};

export const emailRenderer = (row: Row) => {
  return (
    <div>
      <Icon name="mail" size={12} className="mr1" style={{ opacity: 0.6 }} />
      {String(row.row[row.column.idx])}
    </div>
  );
};

export const sourceRenderer = (row: Row) => {
  const size = 12;
  const val = row.row[row.column.idx];
  function getIcon(val: string) {
    switch (val) {
      case "Facebook":
        return <Facebook size={size} />;
      case "Twitter":
        return <Twitter size={size} />;
      case "Google":
        return <Search size={size} />;
      case "Invite":
        return <Mail size={size} />;
      default:
        return null;
    }
  }
  return (
    <div
      style={{ color: val ? "inherirt" : "#666" }}
      className="flex align-center"
    >
      {val && (
        <span className="mr1" style={{ opacity: 0.6 }}>
          {getIcon(val)}
        </span>
      )}
      {String(row.row[row.column.idx])}
    </div>
  );
};

export const countryRenderer = (row: Row) => {
  return (
    <>
      <span className="mr1">
        {getUnicodeFlagIcon(String(row.row[row.column.idx]))}
      </span>
      {String(row.row[row.column.idx])}
    </>
  );
};

export const booleanRenderer = (row: Row) => {
  const val = row.row[row.column.idx];

  return (
    <div>
      <div
        className="mr1"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 12,
          backgroundColor: val ? "#22c55e" : "#f43f5e",
        }}
      ></div>
      {String(val)}
    </div>
  );
};

export const dateRenderer = (row: Row) => {
  return (
    <div>
      <Icon
        name="calendar"
        size={12}
        className="mr1"
        style={{ opacity: 0.6 }}
      />
      {new Date(row.row[row.column.idx]).toLocaleString("en")}
    </div>
  );
};
